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
import {
	buildObjectKeyFromTemplate,
	resolveObjectKeyTemplateContext,
} from "./objectKeyTemplate";
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
import {
	openR2ImageSyncPreviewModal,
	type R2ImageSyncPreviewCandidate,
} from "./ui/R2ImageSyncPreviewModal";

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

interface PreparedSyncUploadItem extends R2ImageSyncPreviewCandidate {
	body: ArrayBuffer;
	contentType: string;
	file: TFile;
	groupedReferences: ResolvedImageReference[];
}

interface PrepareSyncUploadItemsResult {
	items: PreparedSyncUploadItem[];
	skipped: number;
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
	const { items: preparedItems, skipped } = await prepareSyncUploadItems(
		plugin,
		view.file,
		content
	);

	if (preparedItems.length === 0) {
		if (skipped > 0) {
			new Notice(`Image sync: 0 uploaded, ${skipped} skipped, 0 failed.`);
		} else {
			new Notice("Image sync: no local images to upload.");
		}
		return;
	}

	let itemsToUpload = preparedItems;

	if (plugin.settings.showSyncPreviewModal) {
		const selectedCandidates = await openR2ImageSyncPreviewModal(
			plugin.app,
			preparedItems,
			{
				description:
					"Select the local images to upload to cloudflare r2. Review object keys and public urls before syncing.",
				title: "Sync preview",
			}
		);
		if (selectedCandidates === null || selectedCandidates.length === 0) {
			return;
		}

		const selectedIds = new Set(
			selectedCandidates.map((candidate) => candidate.id)
		);
		itemsToUpload = preparedItems.filter((item) => selectedIds.has(item.id));
	}

	const result = await executeSyncUploadItems(
		plugin,
		r2Client,
		itemsToUpload,
		content,
		skipped
	);

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

async function prepareSyncUploadItems(
	plugin: CloudflareR2SyncPlugin,
	activeFile: TFile | null,
	content: string
): Promise<PrepareSyncUploadItemsResult> {
	const items: PreparedSyncUploadItem[] = [];
	let skipped = 0;

	if (!activeFile) {
		return { items, skipped: 1 };
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
			skipped += 1;
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
				skipped += groupedReferences.length;
				continue;
			}

			contentType = "image/webp";
			keyFileName = withWebpFileName(file.name);
		} else {
			body = await plugin.app.vault.readBinary(file);
			contentType = getImageContentType(file.extension);
			keyFileName = file.name;
		}

		const template = plugin.settings.objectKeyTemplate;
		const context = await resolveObjectKeyTemplateContext(
			activeFile,
			body,
			template
		);
		const objectKey = await buildObjectKeyFromTemplate(
			keyFileName,
			uploadDate,
			template,
			context
		);
		const publicUrl = buildPublicUrl(plugin.settings.publicBaseUrl, objectKey);

		items.push({
			id: file.path,
			sourceLabel: file.path,
			previewUrl: plugin.app.vault.getResourcePath(file),
			objectKey,
			publicUrl,
			referenceCount: groupedReferences.length,
			body,
			contentType,
			file,
			groupedReferences,
		});
	}

	return { items, skipped };
}

async function executeSyncUploadItems(
	plugin: CloudflareR2SyncPlugin,
	r2Client: R2ImageClient,
	items: PreparedSyncUploadItem[],
	content: string,
	baseSkipped: number
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
		skipped: baseSkipped,
		trashFailed: 0,
		trashed: 0,
		uploaded: 0,
	};
	let nextContent = content;

	for (const item of items) {
		try {
			await r2Client.uploadIfAbsent({
				body: item.body,
				bucketName: plugin.settings.bucketName.trim(),
				contentType: item.contentType,
				key: item.objectKey,
			});
			counts.uploaded += 1;
			nextContent = replaceNoteBodyImageRefsWithUrl(
				nextContent,
				item.groupedReferences.map(({ reference }) => reference),
				item.publicUrl
			);
			filesToTrash.push(item.file);
		} catch (error) {
			counts.failed += item.groupedReferences.length;
			if (error instanceof ObjectAlreadyExistsError) {
				counts.alreadyExists += item.groupedReferences.length;
				alreadyExistingImages.push({
					filePath: item.file.path,
					objectKey: item.objectKey,
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
