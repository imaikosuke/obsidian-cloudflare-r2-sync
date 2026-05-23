import { extensionFromFile } from "../droppedImageFiles";
import { SUPPORTED_IMAGE_EXTENSIONS } from "../imagePaths";

export function isSupportedCoverImageFile(file: File): boolean {
	const ext = extensionFromFile(file);
	if (ext !== "" && SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
		return true;
	}

	return file.type.toLowerCase().startsWith("image/");
}

export function pickCoverImageFile(): Promise<File | null> {
	return new Promise((resolve) => {
		const body = activeDocument.body;
		if (!body) {
			resolve(null);
			return;
		}

		const input = body.createEl("input", {
			cls: "cloudflare-r2-sync-hidden-file-input",
			attr: { accept: "image/*", type: "file" },
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
