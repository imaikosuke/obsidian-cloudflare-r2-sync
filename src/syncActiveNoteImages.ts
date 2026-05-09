import { MarkdownView, Notice, TFile } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import {
	convertToWebp,
	shouldConvertToWebp,
	withWebpFileName,
} from "./convert";
import { getImageContentType } from "./imageContentType";
import {
	collectNoteBodyImageReferences,
	type NoteBodyImageReference,
	replaceNoteBodyImageRefsWithUrl,
	resolveNoteImageLinkToFile,
} from "./noteBodyImageRefs";
import { buildObjectKeyFromTemplate } from "./objectKeyTemplate";
import { createR2Client, getMissingSettings } from "./pluginR2";
import { buildPublicUrl } from "./publicR2Url";
import {
	ObjectAlreadyExistsError,
	type R2ImageClient,
} from "./r2";
import {
	formatR2ErrorForNotice,
	truncateForNotice,
} from "./r2ErrorInsight";

interface ResolvedImageReference {
	file: TFile;
	reference: NoteBodyImageReference;
}

interface SyncCounts {
	alreadyExists: number;
	failed: number;
	skipped: number;
	trashFailed: number;
	trashed: number;
	uploaded: number;
}

interface AlreadyExistingImage {
	filePath: string;
	objectKey: string;
}

interface SyncResult {
	alreadyExistingImages: AlreadyExistingImage[];
	counts: SyncCounts;
	filesToTrash: TFile[];
	nextContent: string;
	failureDetailLines: string[];
}

export async function syncActiveNoteImages(
	plugin: CloudflareR2SyncPlugin
): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		new Notice("Image sync: open a Markdown note first.");
		return;
	}

	const missingSettings = getMissingSettings(plugin);
	if (missingSettings.length > 0) {
		new Notice(`Image sync: missing ${missingSettings.join(", ")}.`);
		return;
	}

	const r2Client = createR2Client(plugin);
	if (r2Client === null) {
		new Notice("Image sync: missing secret value.");
		return;
	}

	const content = view.editor.getValue();
	const result = await syncContent(plugin, r2Client, view.file, content);

	if (result.nextContent !== content) {
		view.editor.setValue(result.nextContent);
	}

	const counts: SyncCounts = { ...result.counts };
	for (const file of result.filesToTrash) {
		try {
			await plugin.app.fileManager.trashFile(file);
			counts.trashed += 1;
		} catch {
			counts.trashFailed += 1;
		}
	}

	new Notice(formatResultNotice(counts));

	for (const line of result.failureDetailLines) {
		new Notice(line, 12_000);
	}

	for (const { filePath, objectKey } of result.alreadyExistingImages) {
		new Notice(
			`Image sync: already exists: ${filePath} (${objectKey})`
		);
	}
}

async function syncContent(
	plugin: CloudflareR2SyncPlugin,
	r2Client: R2ImageClient,
	activeFile: TFile | null,
	content: string
): Promise<SyncResult> {
	const failureDetailLines: string[] = [];
	const seenDetailLines = new Set<string>();

	const maybeFailureDetail = (rawLine: string): void => {
		if (!plugin.settings.notifyDetailedErrors) {
			return;
		}

		if (failureDetailLines.length >= 6) {
			return;
		}

		const line = truncateForNotice(rawLine);
		if (seenDetailLines.has(line)) {
			return;
		}

		seenDetailLines.add(line);
		failureDetailLines.push(line);
	};

	const alreadyExistingImages: AlreadyExistingImage[] = [];
	const filesToTrash: TFile[] = [];
	const counts: SyncCounts = {
		alreadyExists: 0,
		failed: 0,
		skipped: 0,
		trashFailed: 0,
		trashed: 0,
		uploaded: 0,
	};
	let nextContent = content;

	if (!activeFile) {
		return {
			alreadyExistingImages,
			counts: { ...counts, skipped: 1 },
			failureDetailLines,
			filesToTrash: [],
			nextContent,
		};
	}

	const sourcePath = activeFile.path;
	const references = collectNoteBodyImageReferences(content);
	const resolvedReferences = new Map<string, ResolvedImageReference[]>();

	for (const reference of references) {
		const file = resolveNoteImageLinkToFile(
			plugin,
			reference.target,
			sourcePath
		);
		if (!file) {
			counts.skipped += 1;
			continue;
		}

		const existing = resolvedReferences.get(file.path) ?? [];
		existing.push({ file, reference });
		resolvedReferences.set(file.path, existing);
	}

	for (const groupedReferences of resolvedReferences.values()) {
		const { file } = groupedReferences[0];
		const uploadDate = new Date();

		let body: ArrayBuffer;
		let contentType: string;
		let keyFileName: string;

		if (
			plugin.settings.convertArticleImagesToWebp &&
			shouldConvertToWebp(file.extension)
		) {
			try {
				const rawBody = await plugin.app.vault.readBinary(file);
				body = await convertToWebp(rawBody, plugin.settings.webpQuality);
			} catch {
				counts.failed += groupedReferences.length;
				maybeFailureDetail(
					"Image sync: local read or WebP conversion failed."
				);
				continue;
			}

			contentType = "image/webp";
			keyFileName = withWebpFileName(file.name);
		} else {
			body = await plugin.app.vault.readBinary(file);
			contentType = getImageContentType(file.extension);
			keyFileName = file.name;
		}

		const objectKey = buildObjectKeyFromTemplate(
			keyFileName,
			uploadDate,
			plugin.settings.objectKeyTemplate
		);
		const publicUrl = buildPublicUrl(plugin.settings.publicBaseUrl, objectKey);

		try {
			await r2Client.uploadIfAbsent({
				body,
				bucketName: plugin.settings.bucketName.trim(),
				contentType,
				key: objectKey,
			});
			counts.uploaded += 1;
			nextContent = replaceNoteBodyImageRefsWithUrl(
				nextContent,
				groupedReferences.map(({ reference }) => reference),
				publicUrl
			);
			filesToTrash.push(file);
		} catch (error) {
			counts.failed += groupedReferences.length;
			if (error instanceof ObjectAlreadyExistsError) {
				counts.alreadyExists += groupedReferences.length;
				alreadyExistingImages.push({
					filePath: file.path,
					objectKey,
				});
			} else {
				maybeFailureDetail(
					`Image sync: ${formatR2ErrorForNotice(error)}`
				);
			}
		}
	}

	return {
		alreadyExistingImages,
		counts,
		failureDetailLines,
		filesToTrash,
		nextContent,
	};
}

function formatResultNotice(counts: SyncCounts): string {
	const parts = [
		`Image sync: ${counts.uploaded} uploaded, ${counts.skipped} skipped, ${counts.failed} failed`,
		`${counts.trashed} trashed`,
		`${counts.trashFailed} trash failed`,
	];

	if (counts.alreadyExists > 0) {
		parts.push(`${counts.alreadyExists} already exists`);
	}

	return `${parts.join(", ")}.`;
}
