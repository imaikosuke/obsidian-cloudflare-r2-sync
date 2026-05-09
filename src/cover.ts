import { MarkdownView, Notice } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import { ObjectAlreadyExistsError } from "./r2";
import {
	buildObjectKeyFromTemplate,
	buildPublicUrl,
	createR2Client,
	getMissingSettings,
	resolveCoverObjectKeyTemplate,
} from "./sync";
import {
	formatR2ErrorForNotice,
	truncateForNotice,
} from "./r2ErrorInsight";

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

	if (!isLikelyPng(picked)) {
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
			const data = frontmatter as { cover?: string };
			data.cover = publicUrl;
		});
	} catch {
		new Notice(
			"Cover upload: uploaded to r2 but failed to update frontmatter."
		);
		return;
	}

	new Notice("Cover upload: cover URL saved to frontmatter.");
}

function isLikelyPng(file: File): boolean {
	const lowerName = file.name.toLowerCase();

	return lowerName.endsWith(".png") || file.type === "image/png";
}

function pickPngFile(): Promise<File | null> {
	return new Promise((resolve) => {
		const body = activeDocument.body;
		if (!body) {
			resolve(null);
			return;
		}

		const input = body.createEl("input", {
			cls: "cloudflare-r2-sync-hidden-file-input",
			attr: { accept: "image/png", type: "file" },
		});
		let settled = false;

		const finish = (value: File | null): void => {
			if (settled) {
				return;
			}

			settled = true;
			input.remove();
			resolve(value);
		};

		input.addEventListener("change", () => {
			finish(input.files?.[0] ?? null);
		});

		input.addEventListener("cancel", () => {
			finish(null);
		});

		input.click();
	});
}
