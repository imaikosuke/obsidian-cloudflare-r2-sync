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
import { buildObjectKeyFromTemplate } from "./objectKeyTemplate";
import { createR2Client, getMissingSettings } from "./pluginR2";
import { buildPublicUrl } from "./publicR2Url";
import type { R2ImageClient } from "./r2";
import {
	formatR2ErrorForNotice,
	truncateForNotice,
} from "./r2ErrorInsight";

export interface EditorDropUploadPlan {
	imageFiles: File[];
	r2Client: R2ImageClient;
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

async function uploadOneDroppedFileToR2(
	plugin: CloudflareR2SyncPlugin,
	r2Client: R2ImageClient,
	file: File,
	sourcePath: string
): Promise<string> {
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
			const rawBody = await file.arrayBuffer();
			return saveLocalAttachmentAsMarkdown(
				plugin,
				rawBody,
				displayName,
				sourcePath
			);
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
		return `![](${publicUrl})`;
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
			body,
			keyFileName,
			sourcePath
		);
	}
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
	const lines: string[] = [];

	try {
		for (const file of imageFiles) {
			lines.push(
				await uploadOneDroppedFileToR2(plugin, r2Client, file, sourcePath)
			);
		}
	} catch {
		new Notice("Drop upload failed.");
		return;
	}

	const insertion =
		lines.length > 0 ? `${lines.join("\n\n")}\n` : "";
	editor.replaceRange(insertion, dropPos, dropPos);
}
