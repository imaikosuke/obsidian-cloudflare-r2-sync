import type { R2CachePreset } from "./r2";

/** Default layout matches the original yyyymm/dd/timestamp-filename pattern (local time). */
export const DEFAULT_OBJECT_KEY_TEMPLATE =
	"{year}/{month}/{timestamp}-{filename}";

export interface PluginSettings {
	accountId: string;
	bucketName: string;
	/**
	 * Object key path pattern. Placeholders: {year}, {month}, {day}, {hour},
	 * {minute}, {second}, {timestamp} (yyyymmddhhmmss, local), {filename} (sanitized),
	 * {slug}, {notepath}, {hash}, {uuid}.
	 */
	objectKeyTemplate: string;
	/**
	 * Optional template for cover uploads only. Same placeholders as
	 * `objectKeyTemplate`. Empty string means use `objectKeyTemplate`.
	 */
	coverObjectKeyTemplate: string;
	/** YAML frontmatter key where the cover image public URL is stored. */
	coverFrontmatterProperty: string;
	publicBaseUrl: string;
	accessKeyIdSecretName: string;
	secretAccessKeySecretName: string;
	/**
	 * When true, PNG, JPEG, JPG, and BMP are re-encoded to WebP before upload
	 * (sync and editor drop). When false, originals are uploaded unchanged.
	 */
	convertArticleImagesToWebp: boolean;
	/** WebP quality for converted article images (0–1). */
	webpQuality: number;
	/**
	 * When true, PNG, JPEG, JPG, and BMP are re-encoded to WebP before cover upload.
	 * When false, originals are uploaded unchanged.
	 */
	convertCoverImagesToWebp: boolean;
	/** WebP quality for converted cover images (0–1). */
	coverWebpQuality: number;
	/** Preset for `Cache-Control` on uploaded objects. */
	r2UploadCachePreset: R2CachePreset;
	/** Show categorized r2/SDK failure text in notices (for support screenshots). */
	notifyDetailedErrors: boolean;
	/** When enabled, images dropped into the editor upload to r2 automatically. */
	autoUploadOnDrop: boolean;
	/** When enabled, show a preview modal before drop upload, sync images to r2, or upload cover image. */
	showSyncPreviewModal: boolean;
}

/** Trims; empty falls back so existing vaults keep using `cover`. */
export function resolveCoverFrontmatterProperty(
	settings: Pick<PluginSettings, "coverFrontmatterProperty">
): string {
	const t = String(settings.coverFrontmatterProperty ?? "").trim();
	return t === "" ? "cover" : t;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	accountId: "",
	bucketName: "",
	objectKeyTemplate: DEFAULT_OBJECT_KEY_TEMPLATE,
	coverObjectKeyTemplate: "",
	coverFrontmatterProperty: "cover",
	publicBaseUrl: "",
	accessKeyIdSecretName: "",
	secretAccessKeySecretName: "",
	convertArticleImagesToWebp: true,
	webpQuality: 0.8,
	convertCoverImagesToWebp: false,
	coverWebpQuality: 0.8,
	r2UploadCachePreset: "yearImmutable",
	notifyDetailedErrors: false,
	autoUploadOnDrop: true,
	showSyncPreviewModal: false,
};
