import { MarkdownView, Notice, TFile } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import {
	convertToWebp,
	shouldConvertToWebp,
	withWebpFileName,
} from "./convert";
import { extensionFromFile } from "./droppedImageFiles";
import { getImageContentType } from "./imageContentType";
import { ObjectAlreadyExistsError, type R2ImageClient } from "./r2";
import {
	buildObjectKeyFromTemplate,
	resolveCoverObjectKeyTemplate,
	resolveObjectKeyTemplateContext,
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
import {
	openR2ImageSyncPreviewModal,
	type R2ImageSyncPreviewCandidate,
} from "./ui/R2ImageSyncPreviewModal";

interface PreparedCoverUploadItem extends R2ImageSyncPreviewCandidate {
	body: ArrayBuffer;
	contentType: string;
}

async function prepareCoverUploadItem(
	plugin: CloudflareR2SyncPlugin,
	file: TFile,
	picked: File,
	createPreviewUrl: boolean
): Promise<PreparedCoverUploadItem | null> {
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
			return null;
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
	const template = resolveCoverObjectKeyTemplate(plugin.settings);
	const context = await resolveObjectKeyTemplateContext(
		file,
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
	const displayName = picked.name !== "" ? picked.name : keyFileName;

	return {
		id: `cover-${displayName}`,
		sourceLabel: displayName,
		previewUrl: createPreviewUrl ? URL.createObjectURL(picked) : "",
		objectKey,
		publicUrl,
		body,
		contentType,
	};
}

async function executeCoverUploadItem(
	plugin: CloudflareR2SyncPlugin,
	r2Client: R2ImageClient,
	file: TFile,
	item: PreparedCoverUploadItem
): Promise<boolean> {
	try {
		await r2Client.uploadIfAbsent({
			body: item.body,
			bucketName: plugin.settings.bucketName.trim(),
			contentType: item.contentType,
			key: item.objectKey,
		});
	} catch (error) {
		if (error instanceof ObjectAlreadyExistsError) {
			new Notice(`Cover upload: object already exists (${item.objectKey}).`);
			return false;
		}

		if (plugin.settings.notifyDetailedErrors) {
			new Notice(
				truncateForNotice(
					`Cover upload: ${formatR2ErrorForNotice(error)}`,
					520
				),
				12_000
			);
			return false;
		}

		new Notice("Cover upload: upload failed.");
		return false;
	}

	const frontmatterProperty = resolveCoverFrontmatterProperty(plugin.settings);

	try {
		await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const data = frontmatter as Record<string, unknown>;
			data[frontmatterProperty] = item.publicUrl;
		});
	} catch {
		new Notice(
			"Cover upload: uploaded to r2 but failed to update frontmatter."
		);
		return false;
	}

	new Notice(
		`Cover upload: URL saved to frontmatter (${frontmatterProperty}).`
	);
	return true;
}

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

	const createPreviewUrl = plugin.settings.showSyncPreviewModal;
	const preparedItem = await prepareCoverUploadItem(
		plugin,
		view.file,
		picked,
		createPreviewUrl
	);
	if (preparedItem === null) {
		return;
	}

	let itemToUpload = preparedItem;

	if (plugin.settings.showSyncPreviewModal) {
		const selectedCandidates = await openR2ImageSyncPreviewModal(
			plugin.app,
			[preparedItem],
			{
				description:
					"Select the cover image to upload to cloudflare r2. Review object key and public url before uploading.",
				title: "Sync preview",
			}
		);
		if (selectedCandidates === null || selectedCandidates.length === 0) {
			return;
		}
		itemToUpload = preparedItem;
	}

	await executeCoverUploadItem(plugin, r2Client, view.file, itemToUpload);
}
