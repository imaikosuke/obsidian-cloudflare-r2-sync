export function isLikelyPngFile(file: File): boolean {
	const lowerName = file.name.toLowerCase();

	return lowerName.endsWith(".png") || file.type === "image/png";
}

export function pickPngFile(): Promise<File | null> {
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
