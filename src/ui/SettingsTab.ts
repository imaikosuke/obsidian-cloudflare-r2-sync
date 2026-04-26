import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type CloudflareR2SyncPlugin from "../../main";

/** Settings screen. Add UI fields that map to `PluginSettings` in `src/settings.ts`. */
export class CloudflareR2SyncSettingTab extends PluginSettingTab {
	plugin: CloudflareR2SyncPlugin;

	constructor(app: App, plugin: CloudflareR2SyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable sample action")
			.setDesc(
				"When on, the ribbon and the sample command show a success notice. Replace with your first real setting."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sampleEnabled)
					.onChange(async (value) => {
						try {
							this.plugin.settings.sampleEnabled = value;
							await this.plugin.saveSettings();
						} catch {
							new Notice("Error.");
						}
					})
			);
	}
}
