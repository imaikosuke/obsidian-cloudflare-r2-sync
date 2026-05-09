import type { Editor, MarkdownFileInfo, MarkdownView } from "obsidian";
import { Notice, TFile } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import {
	convertToWebp,
	shouldConvertToWebp,
	withWebpFileName,
} from "./convert";
import type { R2ImageClient } from "./r2";
import {
	formatR2ErrorForNotice,
	truncateForNotice,
} from "./r2ErrorInsight";
import {
	buildObjectKeyFromTemplate,
	buildPublicUrl,
	createR2Client,
	getImageContentType,
	getMissingSettings,
} from "./sync";

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
	"bmp",
	"gif",
	"ico",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"webp",
]);

interface MinimalCodeMirrorView {
	posAtCoords(coords: { x: number; y: number }): number | null;
}

function getExtensionFromPath(target: string): string {
	const withoutSubpath = target.split("#")[0]?.split("?")[0] ?? target;
	const dotIndex = withoutSubpath.lastIndexOf(".");
	if (dotIndex < 0) {
		return "";
	}
	return withoutSubpath.slice(dotIndex + 1).toLowerCase();
}

function extensionFromMime(mime: string): string {
	const lower = mime.toLowerCase();
	switch (lower) {
		case "image/bmp":
			return "bmp";
		case "image/gif":
			return "gif";
		case "image/x-icon":
		case "image/vnd.microsoft.icon":
			return "ico";
		case "image/jpeg":
			return "jpg";
		case "image/png":
			return "png";
		case "image/svg+xml":
			return "svg";
		case "image/webp":
			return "webp";
		default:
			return "";
	}
}

function extensionFromFile(file: File): string {
	const fromName = getExtensionFromPath(file.name);
	if (fromName !== "") {
		return fromName;
	}
	return extensionFromMime(file.type);
}

function effectiveFileName(file: File): string {
	const trimmed = file.name.trim();
	if (trimmed !== "") {
		return trimmed;
	}
	const ext = extensionFromFile(file);
	if (ext !== "") {
		return `image.${ext}`;
	}
	return "image.png";
}

function collectImageFiles(dataTransfer: DataTransfer | null): File[] {
	if (!dataTransfer) {
		return [];
	}

	const out: File[] = [];
	const { files } = dataTransfer;
	for (let index = 0; index < files.length; index += 1) {
		const file = files.item(index);
		if (!file) {
			continue;
		}

		const ext = extensionFromFile(file);
		if (ext !== "" && SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
			out.push(file);
			continue;
		}
		if (file.type.toLowerCase().startsWith("image/")) {
			out.push(file);
		}
	}
	return out;
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

function resolveSourcePath(info: MarkdownFileInfo | MarkdownView): string {
	const fromInfo = info.file?.path ?? "";
	if (fromInfo !== "") {
		return fromInfo;
	}
	return info.app.workspace.getActiveFile()?.path ?? "";
}

async function saveLocallyAndLink(
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

async function uploadDroppedImage(
	plugin: CloudflareR2SyncPlugin,
	r2Client: R2ImageClient,
	file: File,
	sourcePath: string
): Promise<string> {
	const displayName = effectiveFileName(file);
	const ext = extensionFromFile(file);
	let body: ArrayBuffer;
	let contentType: string;
	let keyFileName: string;
	const uploadDate = new Date();

	if (ext !== "" && shouldConvertToWebp(ext)) {
		try {
			const rawBody = await file.arrayBuffer();
			body = await convertToWebp(rawBody, plugin.settings.webpQuality);
		} catch {
			const rawBody = await file.arrayBuffer();
			return saveLocallyAndLink(plugin, rawBody, displayName, sourcePath);
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
		return saveLocallyAndLink(plugin, body, keyFileName, sourcePath);
	}
}

/**
 * Synchronous guard for {@link completeEditorDropUpload}. When true, the
 * caller should call {@link DragEvent.preventDefault} on the drop event.
 */
export function shouldInterceptEditorDrop(
	plugin: CloudflareR2SyncPlugin,
	evt: DragEvent
): boolean {
	if (!plugin.settings.autoUploadOnDrop) {
		return false;
	}

	const imageFiles = collectImageFiles(evt.dataTransfer);
	if (imageFiles.length === 0) {
		return false;
	}

	if (getMissingSettings(plugin).length > 0) {
		return false;
	}

	if (createR2Client(plugin) === null) {
		return false;
	}

	return true;
}

/**
 * Completes an intercepted drop: uploads images to r2 (or saves locally on
 * failure) and inserts markdown at the drop position. Call only after
 * {@link DragEvent.preventDefault}.
 */
export async function completeEditorDropUpload(
	plugin: CloudflareR2SyncPlugin,
	evt: DragEvent,
	editor: Editor,
	info: MarkdownView | MarkdownFileInfo
): Promise<void> {
	const imageFiles = collectImageFiles(evt.dataTransfer);
	const r2Client = createR2Client(plugin);
	if (r2Client === null || imageFiles.length === 0) {
		return;
	}

	const sourcePath = resolveSourcePath(info);
	const dropPos = getDropPosition(editor, evt);
	const lines: string[] = [];

	try {
		for (const file of imageFiles) {
			lines.push(
				await uploadDroppedImage(plugin, r2Client, file, sourcePath)
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
