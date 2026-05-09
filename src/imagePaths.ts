export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
	"bmp",
	"gif",
	"ico",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"webp",
]);

export function parseMarkdownTarget(rawTarget: string): string {
	const trimmedTarget = rawTarget.trim();
	if (trimmedTarget.startsWith("<") && trimmedTarget.endsWith(">")) {
		return trimmedTarget.slice(1, -1);
	}

	return trimmedTarget;
}

function stripSubpath(target: string): string {
	return target.split("#")[0];
}

/** File extension from a path, wiki link, or URL (lowercase, no leading dot). */
export function getPathExtension(target: string): string {
	const targetWithoutSubpath = stripSubpath(target).split("?")[0];
	const dotIndex = targetWithoutSubpath.lastIndexOf(".");

	if (dotIndex < 0) {
		return "";
	}

	return targetWithoutSubpath.slice(dotIndex + 1).toLowerCase();
}
