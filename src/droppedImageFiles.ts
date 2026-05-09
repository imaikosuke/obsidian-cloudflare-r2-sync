import {
	getPathExtension,
	SUPPORTED_IMAGE_EXTENSIONS,
} from "./imagePaths";

export function extensionFromMime(mime: string): string {
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

export function extensionFromFile(file: File): string {
	const fromName = getPathExtension(file.name);
	if (fromName !== "") {
		return fromName;
	}
	return extensionFromMime(file.type);
}

export function effectiveDroppedImageFileName(file: File): string {
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

export function collectDroppedImageFiles(
	dataTransfer: DataTransfer | null
): File[] {
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
