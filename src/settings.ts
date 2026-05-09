import type { R2CachePreset } from "./r2";

/** Default layout matches the original yyyymm/dd/timestamp-filename pattern (local time). */
export const DEFAULT_OBJECT_KEY_TEMPLATE =
	"{year}/{month}/{timestamp}-{filename}";

export interface PluginSettings {
	accountId: string;
	bucketName: string;
	/**
	 * Object key path pattern. Placeholders: {year}, {month}, {day}, {hour},
	 * {minute}, {second}, {timestamp} (yyyymmddhhmmss, local), {filename} (sanitized).
	 */
	objectKeyTemplate: string;
	/**
	 * Optional template for cover uploads only. Same placeholders as
	 * `objectKeyTemplate`. Empty string means use `objectKeyTemplate`.
	 */
	coverObjectKeyTemplate: string;
	publicBaseUrl: string;
	accessKeyIdSecretName: string;
	secretAccessKeySecretName: string;
	/** WebP quality for converted article images (0–1). */
	webpQuality: number;
	/** Preset for `Cache-Control` on uploaded objects. */
	r2UploadCachePreset: R2CachePreset;
	/** Show categorized r2/SDK failure text in notices (for support screenshots). */
	notifyDetailedErrors: boolean;
	/** When enabled, images dropped into the editor upload to r2 automatically. */
	autoUploadOnDrop: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	accountId: "",
	bucketName: "",
	objectKeyTemplate: DEFAULT_OBJECT_KEY_TEMPLATE,
	coverObjectKeyTemplate: "",
	publicBaseUrl: "",
	accessKeyIdSecretName: "",
	secretAccessKeySecretName: "",
	webpQuality: 0.8,
	r2UploadCachePreset: "yearImmutable",
	notifyDetailedErrors: false,
	autoUploadOnDrop: true,
};
