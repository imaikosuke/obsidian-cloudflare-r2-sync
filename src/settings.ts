import type { R2CachePreset } from "./r2";

export interface PluginSettings {
	accountId: string;
	bucketName: string;
	publicBaseUrl: string;
	accessKeyIdSecretName: string;
	secretAccessKeySecretName: string;
	/** WebP quality for converted article images (0–1). */
	webpQuality: number;
	/** Preset for `Cache-Control` on uploaded objects. */
	r2UploadCachePreset: R2CachePreset;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	accountId: "",
	bucketName: "",
	publicBaseUrl: "",
	accessKeyIdSecretName: "",
	secretAccessKeySecretName: "",
	webpQuality: 0.8,
	r2UploadCachePreset: "yearImmutable",
};
