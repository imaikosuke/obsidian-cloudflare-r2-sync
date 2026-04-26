export interface PluginSettings {
	accountId: string;
	bucketName: string;
	publicBaseUrl: string;
	accessKeyIdSecretName: string;
	secretAccessKeySecretName: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	accountId: "",
	bucketName: "",
	publicBaseUrl: "",
	accessKeyIdSecretName: "",
	secretAccessKeySecretName: "",
};
