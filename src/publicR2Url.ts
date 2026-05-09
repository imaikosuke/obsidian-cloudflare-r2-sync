import { normalizePath } from "obsidian";

export function buildPublicUrl(publicBaseUrl: string, objectKey: string): string {
	const normalizedBaseUrl = publicBaseUrl.trim().replace(/\/+$/g, "");
	const encodedKey = normalizePath(objectKey)
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	return `${normalizedBaseUrl}/${encodedKey}`;
}

export function getObjectKeyFromPublicUrl(
	publicBaseUrl: string,
	targetUrl: string
): string | null {
	const normalizedBaseUrl = publicBaseUrl.trim().replace(/\/+$/g, "");
	if (!targetUrl.startsWith(`${normalizedBaseUrl}/`)) {
		return null;
	}

	const encodedKey = targetUrl
		.slice(normalizedBaseUrl.length + 1)
		.split(/[?#]/)[0];
	if (encodedKey.trim() === "") {
		return null;
	}

	try {
		return normalizePath(
			encodedKey
				.split("/")
				.map((segment) => decodeURIComponent(segment))
				.join("/")
		);
	} catch {
		return null;
	}
}
