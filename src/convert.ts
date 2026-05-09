const WEBP_CONVERT_EXTENSIONS = new Set(["bmp", "jpeg", "jpg", "png"]);

export function shouldConvertToWebp(extension: string): boolean {
	return WEBP_CONVERT_EXTENSIONS.has(extension.toLowerCase());
}

/**
 * Raster formats that can be encoded to WebP. Lossless source detail is not preserved;
 * quality is controlled by {@link clampWebpQuality}.
 */
export async function convertToWebp(
	buffer: ArrayBuffer,
	quality: number
): Promise<ArrayBuffer> {
	const blob = new Blob([buffer]);
	const bitmap = await createImageBitmap(blob);

	try {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const context = canvas.getContext("2d");
		if (context === null) {
			throw new Error("Missing 2d canvas context.");
		}

		context.drawImage(bitmap, 0, 0);
		const webpBlob = await canvas.convertToBlob({
			quality: clampWebpQuality(quality),
			type: "image/webp",
		});

		return await webpBlob.arrayBuffer();
	} finally {
		bitmap.close();
	}
}

/**
 * Replaces the last extension with `.webp`, or appends `.webp` if there is none.
 */
export function withWebpFileName(fileName: string): string {
	const dotIndex = fileName.lastIndexOf(".");
	if (dotIndex < 0) {
		return `${fileName}.webp`;
	}

	return `${fileName.slice(0, dotIndex)}.webp`;
}

export function clampWebpQuality(value: number): number {
	if (Number.isNaN(value)) {
		return 0.8;
	}

	return Math.min(1, Math.max(0, value));
}
