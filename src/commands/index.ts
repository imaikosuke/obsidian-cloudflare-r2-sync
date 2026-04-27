import type CloudflareR2SyncPlugin from "../../main";
import { deleteActiveNoteR2Images } from "../delete";
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

	plugin.addCommand({
		id: "delete-r2-images",
		name: "Delete r2 images",
		callback: () => {
			void deleteActiveNoteR2Images(plugin);
		},
	});
}
