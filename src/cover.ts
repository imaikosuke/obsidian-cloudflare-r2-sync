import { MarkdownView, Notice } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import {
	convertToWebp,
	shouldConvertToWebp,
	withWebpFileName,
} from "./convert";
import { extensionFromFile } from "./droppedImageFiles";
import { getImageContentType } from "./imageContentType";
import { ObjectAlreadyExistsError } from "./r2";
import {
	buildObjectKeyFromTemplate,
	resolveCoverObjectKeyTemplate,
} from "./objectKeyTemplate";
import { createR2Client, getMissingSettings } from "./pluginR2";
import { resolveCoverFrontmatterProperty } from "./settings";
import { buildPublicUrl } from "./publicR2Url";
import {
	formatR2ErrorForNotice,
	truncateForNotice,
} from "./r2ErrorInsight";
import {
	isSupportedCoverImageFile,
	pickCoverImageFile,
} from "./ui/coverImagePicker";

export async function uploadCoverImage(
	plugin: CloudflareR2SyncPlugin
): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view?.file) {
		new Notice("Cover upload: open a Markdown note first.");
		return;
	}

	const missingSettings = getMissingSettings(plugin);
	if (missingSettings.length > 0) {
		new Notice(`Cover upload: missing ${missingSettings.join(", ")}.`);
		return;
	}

	const r2Client = createR2Client(plugin);
	if (r2Client === null) {
		new Notice("Cover upload: missing secret value.");
		return;
	}

	const picked = await pickCoverImageFile();
	if (picked === null) {
		new Notice("Cover upload: no file selected.");
		return;
	}

	if (!isSupportedCoverImageFile(picked)) {
		new Notice("Cover upload: unsupported image type.");
		return;
	}

	const ext = extensionFromFile(picked);
	let body: ArrayBuffer;
	let contentType: string;
	let keyFileName: string;

	if (
		plugin.settings.convertCoverImagesToWebp &&
		ext !== "" &&
		shouldConvertToWebp(ext)
	) {
		try {
			const rawBody = await picked.arrayBuffer();
			body = await convertToWebp(rawBody, plugin.settings.coverWebpQuality);
		} catch {
			if (plugin.settings.notifyDetailedErrors) {
				new Notice("Cover upload: WebP conversion failed.", 12_000);
			} else {
				new Notice("Cover upload: WebP conversion failed.");
			}
			return;
		}

		contentType = "image/webp";
		keyFileName = withWebpFileName(picked.name);
	} else {
		body = await picked.arrayBuffer();
		const keyExt = ext !== "" ? ext : "png";
		contentType =
			ext !== ""
				? getImageContentType(ext)
				: (picked.type !== "" ? picked.type : "application/octet-stream");
		keyFileName = picked.name !== "" ? picked.name : `image.${keyExt}`;
	}

	const uploadDate = new Date();
	const objectKey = buildObjectKeyFromTemplate(
		keyFileName,
		uploadDate,
		resolveCoverObjectKeyTemplate(plugin.settings)
	);
	const publicUrl = buildPublicUrl(plugin.settings.publicBaseUrl, objectKey);

	try {
		await r2Client.uploadIfAbsent({
			body,
			bucketName: plugin.settings.bucketName.trim(),
			contentType,
			key: objectKey,
		});
	} catch (error) {
		if (error instanceof ObjectAlreadyExistsError) {
			new Notice(`Cover upload: object already exists (${objectKey}).`);
			return;
		}

		if (plugin.settings.notifyDetailedErrors) {
			new Notice(
				truncateForNotice(
					`Cover upload: ${formatR2ErrorForNotice(error)}`,
					520
				),
				12_000
			);
			return;
		}

		new Notice("Cover upload: upload failed.");
		return;
	}

	const frontmatterProperty = resolveCoverFrontmatterProperty(plugin.settings);

	try {
		await plugin.app.fileManager.processFrontMatter(view.file, (frontmatter) => {
			const data = frontmatter as Record<string, unknown>;
			data[frontmatterProperty] = publicUrl;
		});
	} catch {
		new Notice(
			"Cover upload: uploaded to r2 but failed to update frontmatter."
		);
		return;
	}

	new Notice(
		`Cover upload: URL saved to frontmatter (${frontmatterProperty}).`
	);
}
