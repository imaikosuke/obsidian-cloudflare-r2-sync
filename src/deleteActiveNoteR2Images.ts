import { MarkdownView, Notice } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import {
	collectMarkdownR2PublicImageRefs,
	type MarkdownR2PublicImageRef,
	removeMarkdownR2PublicImageRefs,
} from "./noteMarkdownR2PublicLinks";
import { createR2Client, getMissingSettings } from "./pluginR2";
import {
	formatR2ErrorForNotice,
	truncateForNotice,
} from "./r2ErrorInsight";
import {
	openR2ImageDeleteModal,
	type R2ImageDeletionCandidate,
} from "./ui/R2ImageDeleteModal";

interface DeleteCounts {
	deleted: number;
	failed: number;
	linksRemoved: number;
}

export async function deleteActiveNoteR2Images(
	plugin: CloudflareR2SyncPlugin
): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		new Notice("Image delete: open a Markdown note first.");
		return;
	}

	const missingSettings = getMissingSettings(plugin);
	if (missingSettings.length > 0) {
		new Notice(`Image delete: missing ${missingSettings.join(", ")}.`);
		return;
	}

	const r2Client = createR2Client(plugin);
	if (r2Client === null) {
		new Notice("Image delete: missing secret value.");
		return;
	}

	const content = view.editor.getValue();
	const references = collectMarkdownR2PublicImageRefs(
		content,
		plugin.settings.publicBaseUrl
	);
	if (references.length === 0) {
		new Notice("Image delete: no r2 image links found.");
		return;
	}

	const selectedCandidates = await openR2ImageDeleteModal(
		plugin.app,
		toDeletionCandidates(references)
	);
	if (selectedCandidates === null || selectedCandidates.length === 0) {
		new Notice("Image delete: no images selected.");
		return;
	}

	const selectedObjectKeys = new Set(
		selectedCandidates.map((candidate) => candidate.objectKey)
	);
	const deletedObjectKeys = new Set<string>();
	const counts: DeleteCounts = {
		deleted: 0,
		failed: 0,
		linksRemoved: 0,
	};

	for (const objectKey of selectedObjectKeys) {
		try {
			await r2Client.deleteObject({
				bucketName: plugin.settings.bucketName.trim(),
				key: objectKey,
			});
			deletedObjectKeys.add(objectKey);
			counts.deleted += 1;
		} catch (error) {
			counts.failed += 1;
			const base = `Image delete: failed: ${objectKey}`;
			const message = plugin.settings.notifyDetailedErrors
				? truncateForNotice(`${base}. ${formatR2ErrorForNotice(error)}`, 520)
				: base;
			new Notice(message, plugin.settings.notifyDetailedErrors ? 12_000 : undefined);
		}
	}

	if (deletedObjectKeys.size > 0) {
		const result = removeMarkdownR2PublicImageRefs(
			content,
			references,
			deletedObjectKeys
		);
		if (result.nextContent !== content) {
			view.editor.setValue(result.nextContent);
		}
		counts.linksRemoved = result.removedCount;
	}

	new Notice(formatDeleteNotice(counts));
}

function toDeletionCandidates(
	references: MarkdownR2PublicImageRef[]
): R2ImageDeletionCandidate[] {
	const candidates = new Map<string, R2ImageDeletionCandidate>();

	for (const reference of references) {
		const existing = candidates.get(reference.objectKey);
		if (existing) {
			existing.referenceCount += 1;
			continue;
		}

		candidates.set(reference.objectKey, {
			objectKey: reference.objectKey,
			referenceCount: 1,
			url: reference.url,
		});
	}

	return [...candidates.values()];
}

function formatDeleteNotice(counts: DeleteCounts): string {
	return `Image delete: ${counts.deleted} deleted, ${counts.linksRemoved} links removed, ${counts.failed} failed.`;
}
