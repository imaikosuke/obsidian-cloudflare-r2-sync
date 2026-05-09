import { TFile } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import {
	getPathExtension,
	parseMarkdownTarget,
	SUPPORTED_IMAGE_EXTENSIONS,
} from "./imagePaths";

export interface NoteBodyImageReference {
	fullMatch: string;
	target: string;
	type: "markdown" | "wiki";
}

function stripLinkSubpath(target: string): string {
	return target.split("#")[0];
}

function parseWikiDisplayTarget(rawTarget: string): string {
	return rawTarget.split("|")[0].trim();
}

function isHttpUrl(target: string): boolean {
	const lowerTarget = target.toLowerCase();
	return lowerTarget.startsWith("http://") || lowerTarget.startsWith("https://");
}

function shouldResolveAsLocalImageTarget(target: string): boolean {
	if (isHttpUrl(target)) {
		return false;
	}

	return SUPPORTED_IMAGE_EXTENSIONS.has(getPathExtension(target));
}

export function collectNoteBodyImageReferences(
	content: string
): NoteBodyImageReference[] {
	const references: NoteBodyImageReference[] = [];
	const markdownImagePattern = /!\[[^\]\n]*\]\(([^)\n]+)\)/g;
	const wikiImagePattern = /!\[\[([^\]\n]+)\]\]/g;
	let markdownMatch = markdownImagePattern.exec(content);
	let wikiMatch = wikiImagePattern.exec(content);

	while (markdownMatch) {
		const fullMatch = markdownMatch[0];
		const target = parseMarkdownTarget(markdownMatch[1]);
		if (target && shouldResolveAsLocalImageTarget(target)) {
			references.push({ fullMatch, target, type: "markdown" });
		}

		markdownMatch = markdownImagePattern.exec(content);
	}

	while (wikiMatch) {
		const fullMatch = wikiMatch[0];
		const target = parseWikiDisplayTarget(wikiMatch[1]);
		if (target && shouldResolveAsLocalImageTarget(target)) {
			references.push({ fullMatch, target, type: "wiki" });
		}

		wikiMatch = wikiImagePattern.exec(content);
	}

	return references;
}

export function resolveNoteImageLinkToFile(
	plugin: CloudflareR2SyncPlugin,
	target: string,
	sourceNotePath: string
): TFile | null {
	const file = plugin.app.metadataCache.getFirstLinkpathDest(
		stripLinkSubpath(target),
		sourceNotePath
	);

	return file instanceof TFile ? file : null;
}

export function replaceNoteBodyImageRefsWithUrl(
	content: string,
	references: NoteBodyImageReference[],
	publicUrl: string
): string {
	let nextContent = content;

	for (const reference of references) {
		const replacement =
			reference.type === "wiki"
				? `![](${publicUrl})`
				: reference.fullMatch.replace(reference.target, publicUrl);
		nextContent = nextContent.replace(reference.fullMatch, replacement);
	}

	return nextContent;
}

