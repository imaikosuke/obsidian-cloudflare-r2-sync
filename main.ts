import { Notice, Plugin } from "obsidian";
import { registerCommands } from "./src/commands";
import { PluginSettings, DEFAULT_SETTINGS } from "./src/settings";
import { TemplateSettingTab } from "./src/ui/SettingsTab";

/**
 * Template entry: rename the class, manifest id, and add your own behavior.
 */
export default class PluginTemplate extends Plugin {
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

		this.addSettingTab(new TemplateSettingTab(this.app, this));
		registerCommands(this);
	}
}
