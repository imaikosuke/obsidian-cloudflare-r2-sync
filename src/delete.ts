import { MarkdownView, Notice } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import {
	openR2ImageDeleteModal,
	R2ImageDeletionCandidate,
} from "./ui/R2ImageDeleteModal";
import {
	createR2Client,
	getMissingSettings,
	getObjectKeyFromPublicUrl,
} from "./sync";

interface R2ImageReference {
	end: number;
	fullMatch: string;
	objectKey: string;
	start: number;
	url: string;
}

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
	const references = collectR2ImageReferences(
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
		} catch {
			counts.failed += 1;
			new Notice(`Image delete: failed: ${objectKey}`);
		}
	}

	if (deletedObjectKeys.size > 0) {
		const result = removeDeletedReferences(content, references, deletedObjectKeys);
		if (result.nextContent !== content) {
			view.editor.setValue(result.nextContent);
		}
		counts.linksRemoved = result.removedCount;
	}

	new Notice(formatDeleteNotice(counts));
}

function collectR2ImageReferences(
	content: string,
	publicBaseUrl: string
): R2ImageReference[] {
	const references: R2ImageReference[] = [];
	const markdownImagePattern = /!\[[^\]\n]*\]\(([^)\n]+)\)/g;
	let match = markdownImagePattern.exec(content);

	while (match) {
		const fullMatch = match[0];
		const url = parseMarkdownTarget(match[1]);
		const objectKey = getObjectKeyFromPublicUrl(publicBaseUrl, url);
		if (objectKey !== null) {
			references.push({
				end: match.index + fullMatch.length,
				fullMatch,
				objectKey,
				start: match.index,
				url,
			});
		}

		match = markdownImagePattern.exec(content);
	}

	return references;
}

function toDeletionCandidates(
	references: R2ImageReference[]
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

function removeDeletedReferences(
	content: string,
	references: R2ImageReference[],
	deletedObjectKeys: Set<string>
): { nextContent: string; removedCount: number } {
	let nextContent = content;
	let removedCount = 0;
	const deletedReferences = references
		.filter((reference) => deletedObjectKeys.has(reference.objectKey))
		.sort((a, b) => b.start - a.start);

	for (const reference of deletedReferences) {
		nextContent =
			nextContent.slice(0, reference.start) + nextContent.slice(reference.end);
		removedCount += 1;
	}

	return { nextContent, removedCount };
}

function parseMarkdownTarget(rawTarget: string): string {
	const trimmedTarget = rawTarget.trim();
	if (trimmedTarget.startsWith("<") && trimmedTarget.endsWith(">")) {
		return trimmedTarget.slice(1, -1);
	}

	return trimmedTarget;
}

function formatDeleteNotice(counts: DeleteCounts): string {
	return `Image delete: ${counts.deleted} deleted, ${counts.linksRemoved} links removed, ${counts.failed} failed.`;
}
