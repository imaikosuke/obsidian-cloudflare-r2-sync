import type CloudflareR2SyncPlugin from "../main";
import {
	getCacheControlForPreset,
	normalizeR2CachePreset,
	R2ImageClient,
} from "./r2";

const PLUGIN_SETTING_LABELS = [
	{ key: "accountId", label: "account ID" },
	{ key: "bucketName", label: "bucket name" },
	{ key: "publicBaseUrl", label: "public base URL" },
	{ key: "accessKeyIdSecretName", label: "access key ID secret" },
	{ key: "secretAccessKeySecretName", label: "secret access key secret" },
] as const;

export function getMissingSettings(plugin: CloudflareR2SyncPlugin): string[] {
	const missing: string[] = [];

	for (const { key, label } of PLUGIN_SETTING_LABELS) {
		if (plugin.settings[key].trim() === "") {
			missing.push(label);
		}
	}

	if (
		plugin.settings.accessKeyIdSecretName.trim() !== "" &&
		plugin.app.secretStorage.getSecret(plugin.settings.accessKeyIdSecretName) ===
			null
	) {
		missing.push("access key ID value");
	}
	if (
		plugin.settings.secretAccessKeySecretName.trim() !== "" &&
		plugin.app.secretStorage.getSecret(
			plugin.settings.secretAccessKeySecretName
		) === null
	) {
		missing.push("secret access key value");
	}

	return missing;
}

export function createR2Client(
	plugin: CloudflareR2SyncPlugin
): R2ImageClient | null {
	const accessKeyId = plugin.app.secretStorage.getSecret(
		plugin.settings.accessKeyIdSecretName
	);
	const secretAccessKey = plugin.app.secretStorage.getSecret(
		plugin.settings.secretAccessKeySecretName
	);
	if (accessKeyId === null || secretAccessKey === null) {
		return null;
	}

	const preset = normalizeR2CachePreset(plugin.settings.r2UploadCachePreset);

	return new R2ImageClient({
		accessKeyId,
		accountId: plugin.settings.accountId.trim(),
		cacheControl: getCacheControlForPreset(preset),
		secretAccessKey,
	});
}
