import type CloudflareR2SyncPlugin from "../../main";
import { syncActiveNoteImages } from "../sync";

export function registerCommands(plugin: CloudflareR2SyncPlugin): void {
	plugin.addRibbonIcon("upload-cloud", "Sync images to r2", () => {
		void syncActiveNoteImages(plugin);
	});

	plugin.addCommand({
		id: "sync-images",
		name: "Sync images to r2",
		callback: () => {
			void syncActiveNoteImages(plugin);
		},
	});
}
