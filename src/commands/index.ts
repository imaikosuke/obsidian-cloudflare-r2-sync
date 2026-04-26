import { Notice, Plugin } from "obsidian";
import type PluginTemplate from "../../main";

function runSampleAction(plugin: PluginTemplate): void {
	if (plugin.settings.sampleEnabled) {
		new Notice("Plugin template: sample action.");
	} else {
		new Notice("Sample action is off (enable it in settings).");
	}
}

/**
 * Register ribbon icon and commands. Add your command IDs in manifest.json as needed.
 */
export function registerCommands(plugin: Plugin): void {
	const p = plugin as PluginTemplate;

	plugin.addRibbonIcon("dice", "Run sample action", () => {
		runSampleAction(p);
	});

	plugin.addCommand({
		id: "sample",
		name: "Run sample action",
		callback: () => {
			runSampleAction(p);
		},
	});
}
