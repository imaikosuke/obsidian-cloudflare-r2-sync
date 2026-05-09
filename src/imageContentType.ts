export function getImageContentType(extension: string): string {
	switch (extension.toLowerCase()) {
		case "bmp":
			return "image/bmp";
		case "gif":
			return "image/gif";
		case "ico":
			return "image/vnd.microsoft.icon";
		case "jpeg":
		case "jpg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "svg":
			return "image/svg+xml";
		case "webp":
			return "image/webp";
		default:
			return "application/octet-stream";
	}
}
