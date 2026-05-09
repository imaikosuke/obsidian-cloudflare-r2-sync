import { MarkdownView, Notice } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
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
	isLikelyPngFile,
	pickPngFile,
} from "./ui/coverPngPicker";

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

	const picked = await pickPngFile();
	if (picked === null) {
		new Notice("Cover upload: no file selected.");
		return;
	}

	if (!isLikelyPngFile(picked)) {
		new Notice("Cover upload: choose a PNG image.");
		return;
	}

	const body = await picked.arrayBuffer();
	const uploadDate = new Date();
	const objectKey = buildObjectKeyFromTemplate(
		picked.name,
		uploadDate,
		resolveCoverObjectKeyTemplate(plugin.settings)
	);
	const publicUrl = buildPublicUrl(plugin.settings.publicBaseUrl, objectKey);

	try {
		await r2Client.uploadIfAbsent({
			body,
			bucketName: plugin.settings.bucketName.trim(),
			contentType: "image/png",
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

	try {
		await plugin.app.fileManager.processFrontMatter(view.file, (frontmatter) => {
			const data = frontmatter as Record<string, unknown>;
			data[resolveCoverFrontmatterProperty(plugin.settings)] = publicUrl;
		});
	} catch {
		new Notice(
			"Cover upload: uploaded to r2 but failed to update frontmatter."
		);
		return;
	}

	new Notice("Cover upload: cover URL saved to frontmatter.");
}
