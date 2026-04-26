import { Notice, Plugin } from "obsidian";
import { registerCommands } from "./src/commands";
import { PluginSettings, DEFAULT_SETTINGS } from "./src/settings";
import { CloudflareR2SyncSettingTab } from "./src/ui/SettingsTab";

/**
 * Plugin entry.
 */
export default class CloudflareR2SyncPlugin extends Plugin {
	settings!: PluginSettings;

	async saveSettings(): Promise<void> {
		try {
			await this.saveData(this.settings);
		} catch {
			new Notice("Failed to save settings.");
		}
	}

	async onload(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<PluginSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...loaded };

		this.addSettingTab(new CloudflareR2SyncSettingTab(this.app, this));
		registerCommands(this);
	}
}
