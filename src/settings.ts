/**
 * Plugin settings. Extend this interface and DEFAULT_SETTINGS for your feature flags.
 */
export interface PluginSettings {
	/** Example toggle wired through settings UI and the sample command. */
	sampleEnabled: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	sampleEnabled: true,
};
