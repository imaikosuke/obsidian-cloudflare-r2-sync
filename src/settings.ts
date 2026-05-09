export interface PluginSettings {
	accountId: string;
	bucketName: string;
	publicBaseUrl: string;
	accessKeyIdSecretName: string;
	secretAccessKeySecretName: string;
	/** WebP quality for converted article images (0–1). */
	webpQuality: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	accountId: "",
	bucketName: "",
	publicBaseUrl: "",
	accessKeyIdSecretName: "",
	secretAccessKeySecretName: "",
	webpQuality: 0.8,
};
