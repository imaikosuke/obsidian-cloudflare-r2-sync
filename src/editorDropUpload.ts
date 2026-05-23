import type { Editor, MarkdownFileInfo, MarkdownView } from "obsidian";
import { Notice, TFile } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import {
	convertToWebp,
	shouldConvertToWebp,
	withWebpFileName,
} from "./convert";
import {
	collectDroppedImageFiles,
	effectiveDroppedImageFileName,
	extensionFromFile,
	extensionFromMime,
} from "./droppedImageFiles";
import { getImageContentType } from "./imageContentType";
import {
	buildObjectKeyFromTemplate,
	resolveObjectKeyTemplateContext,
} from "./objectKeyTemplate";
import { createR2Client, getMissingSettings } from "./pluginR2";
import { buildPublicUrl } from "./publicR2Url";
import type { R2ImageClient } from "./r2";
import {
	formatR2ErrorForNotice,
	truncateForNotice,
} from "./r2ErrorInsight";
import {
	openR2ImageSyncPreviewModal,
	type R2ImageSyncPreviewCandidate,
} from "./ui/R2ImageSyncPreviewModal";

export interface EditorDropUploadPlan {
	imageFiles: File[];
	r2Client: R2ImageClient;
}

interface PreparedDropUploadItem extends R2ImageSyncPreviewCandidate {
	body: ArrayBuffer;
	contentType: string;
	file: File;
	keyFileName: string;
}

interface MinimalCodeMirrorView {
	posAtCoords(coords: { x: number; y: number }): number | null;
}

function getDropPosition(editor: Editor, evt: DragEvent): {
	line: number;
	ch: number;
} {
	const cm = (editor as unknown as { cm?: MinimalCodeMirrorView }).cm;
	if (cm) {
		const offset = cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
		if (offset !== null) {
			return editor.offsetToPos(offset);
		}
	}
	return editor.getCursor();
}

function resolveSourceNotePath(info: MarkdownFileInfo | MarkdownView): string {
	const fromInfo = info.file?.path ?? "";
	if (fromInfo !== "") {
		return fromInfo;
	}
	return info.app.workspace.getActiveFile()?.path ?? "";
}

async function saveLocalAttachmentAsMarkdown(
	plugin: CloudflareR2SyncPlugin,
	body: ArrayBuffer,
	fileName: string,
	sourcePath: string
): Promise<string> {
	const path = await plugin.app.fileManager.getAvailablePathForAttachment(
		fileName,
		sourcePath === "" ? undefined : sourcePath
	);
	await plugin.app.vault.createBinary(path, body);
	const abstract = plugin.app.vault.getAbstractFileByPath(path);
	if (!(abstract instanceof TFile)) {
		throw new Error("Failed to resolve saved attachment.");
	}
	const linkSource =
		sourcePath !== ""
			? sourcePath
			: (plugin.app.workspace.getActiveFile()?.path ?? "");
	const link = plugin.app.fileManager.generateMarkdownLink(
		abstract,
		linkSource
	);
	return link.startsWith("!") ? link : `!${link}`;
}

function resolveSourceNoteFile(
	plugin: CloudflareR2SyncPlugin,
	sourcePath: string
): TFile | null {
	if (sourcePath === "") {
		return null;
	}

	const abstract = plugin.app.vault.getAbstractFileByPath(sourcePath);
	return abstract instanceof TFile ? abstract : null;
}

async function prepareOneDropUploadItem(
	plugin: CloudflareR2SyncPlugin,
	file: File,
	sourcePath: string,
	index: number,
	createPreviewUrl: boolean
): Promise<PreparedDropUploadItem | null> {
	const displayName = effectiveDroppedImageFileName(file);
	const ext = extensionFromFile(file);
	let body: ArrayBuffer;
	let contentType: string;
	let keyFileName: string;
	const uploadDate = new Date();

	if (
		plugin.settings.convertArticleImagesToWebp &&
		ext !== "" &&
		shouldConvertToWebp(ext)
	) {
		try {
			const rawBody = await file.arrayBuffer();
			body = await convertToWebp(rawBody, plugin.settings.webpQuality);
		} catch {
			return null;
		}
		contentType = "image/webp";
		keyFileName = withWebpFileName(displayName);
	} else {
		body = await file.arrayBuffer();
		const keyExt = ext !== "" ? ext : extensionFromMime(file.type);
		contentType =
			keyExt !== ""
				? getImageContentType(keyExt)
				: (file.type !== "" ? file.type : "application/octet-stream");
		keyFileName = displayName;
	}

	const template = plugin.settings.objectKeyTemplate;
	const context = await resolveObjectKeyTemplateContext(
		resolveSourceNoteFile(plugin, sourcePath),
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

	return {
		id: `drop-${index}-${displayName}`,
		sourceLabel: displayName,
		previewUrl: createPreviewUrl ? URL.createObjectURL(file) : "",
		objectKey,
		publicUrl,
		body,
		contentType,
		file,
		keyFileName,
	};
}

async function prepareDropUploadItems(
	plugin: CloudflareR2SyncPlugin,
	imageFiles: File[],
	sourcePath: string,
	createPreviewUrl: boolean
): Promise<PreparedDropUploadItem[]> {
	const items: PreparedDropUploadItem[] = [];

	for (let index = 0; index < imageFiles.length; index += 1) {
		const item = await prepareOneDropUploadItem(
			plugin,
			imageFiles[index],
			sourcePath,
			index,
			createPreviewUrl
		);
		if (item !== null) {
			items.push(item);
		}
	}

	return items;
}

async function uploadPreparedDropItemToR2(
	plugin: CloudflareR2SyncPlugin,
	r2Client: R2ImageClient,
	item: PreparedDropUploadItem,
	sourcePath: string
): Promise<string> {
	try {
		await r2Client.uploadIfAbsent({
			body: item.body,
			bucketName: plugin.settings.bucketName.trim(),
			contentType: item.contentType,
			key: item.objectKey,
		});
		return `![](${item.publicUrl})`;
	} catch (error) {
		if (plugin.settings.notifyDetailedErrors) {
			new Notice(
				truncateForNotice(`Drop upload: ${formatR2ErrorForNotice(error)}`),
				12_000
			);
		} else {
			new Notice("Drop upload failed; saved image locally.");
		}
		return saveLocalAttachmentAsMarkdown(
			plugin,
			item.body,
			item.keyFileName,
			sourcePath
		);
	}
}

async function executeDropUploadItems(
	plugin: CloudflareR2SyncPlugin,
	r2Client: R2ImageClient,
	items: PreparedDropUploadItem[],
	sourcePath: string
): Promise<string[]> {
	const lines: string[] = [];

	for (const item of items) {
		lines.push(
			await uploadPreparedDropItemToR2(plugin, r2Client, item, sourcePath)
		);
	}

	return lines;
}

/**
 * When non-null, the caller should {@link DragEvent.preventDefault} and pass this
 * plan to {@link completeEditorDropUpload}.
 */
export function tryBuildEditorDropUploadPlan(
	plugin: CloudflareR2SyncPlugin,
	evt: DragEvent
): EditorDropUploadPlan | null {
	if (!plugin.settings.autoUploadOnDrop) {
		return null;
	}

	const imageFiles = collectDroppedImageFiles(evt.dataTransfer);
	if (imageFiles.length === 0) {
		return null;
	}

	if (getMissingSettings(plugin).length > 0) {
		return null;
	}

	const r2Client = createR2Client(plugin);
	if (r2Client === null) {
		return null;
	}

	return { imageFiles, r2Client };
}

/**
 * Completes an intercepted drop: uploads to r2 (or saves locally on failure)
 * and inserts markdown at the drop position. Call only after
 * {@link DragEvent.preventDefault}.
 */
export async function completeEditorDropUpload(
	plugin: CloudflareR2SyncPlugin,
	plan: EditorDropUploadPlan,
	editor: Editor,
	info: MarkdownView | MarkdownFileInfo,
	evt: DragEvent
): Promise<void> {
	const { imageFiles, r2Client } = plan;
	if (imageFiles.length === 0) {
		return;
	}

	const sourcePath = resolveSourceNotePath(info);
	const dropPos = getDropPosition(editor, evt);

	try {
		const createPreviewUrl = plugin.settings.showSyncPreviewModal;
		const preparedItems = await prepareDropUploadItems(
			plugin,
			imageFiles,
			sourcePath,
			createPreviewUrl
		);
		if (preparedItems.length === 0) {
			new Notice("Drop upload: no images could be prepared for upload.");
			return;
		}

		let itemsToUpload = preparedItems;

		if (plugin.settings.showSyncPreviewModal) {
			const selectedCandidates = await openR2ImageSyncPreviewModal(
				plugin.app,
				preparedItems,
				{
					description:
						"Select the dropped images to upload to cloudflare r2. Review object keys and public urls before uploading.",
					title: "Sync preview",
				}
			);
			if (selectedCandidates === null || selectedCandidates.length === 0) {
				return;
			}

			const selectedIds = new Set(
				selectedCandidates.map((candidate) => candidate.id)
			);
			itemsToUpload = preparedItems.filter((item) =>
				selectedIds.has(item.id)
			);
		}

		const lines = await executeDropUploadItems(
			plugin,
			r2Client,
			itemsToUpload,
			sourcePath
		);
		const insertion = lines.length > 0 ? `${lines.join("\n\n")}\n` : "";
		editor.replaceRange(insertion, dropPos, dropPos);
	} catch {
		new Notice("Drop upload failed.");
	}
}
