import { Notice, Plugin } from "obsidian";
import {
	completeEditorDropUpload,
	tryBuildEditorDropUploadPlan,
} from "./src/editorDropUpload";
import { registerCommands } from "./src/commands";
import { DEFAULT_SETTINGS, type PluginSettings } from "./src/settings";
import { migrateLegacySettingsFromRaw } from "./src/objectKeyTemplate";
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
		const rawRecord = (await this.loadData()) as Record<string, unknown> | null;
		const migrated = migrateLegacySettingsFromRaw(rawRecord);
		const loaded = (
			rawRecord ? { ...rawRecord } : {}
		) as Partial<PluginSettings> & { objectKeyPrefix?: unknown };
		delete loaded.objectKeyPrefix;

		this.settings = { ...DEFAULT_SETTINGS, ...loaded, ...migrated };
		this.addSettingTab(new CloudflareR2SyncSettingTab(this.app, this));
		registerCommands(this);
		this.registerEvent(
			this.app.workspace.on("editor-drop", (evt, editor, info) => {
				if (evt.defaultPrevented) {
					return;
				}
				const plan = tryBuildEditorDropUploadPlan(this, evt);
				if (plan === null) {
					return;
				}
				evt.preventDefault();
				void completeEditorDropUpload(this, plan, editor, info, evt);
			})
		);
	}
}
