import { parseMarkdownTarget } from "./imagePaths";
import { getObjectKeyFromPublicUrl } from "./publicR2Url";

export interface MarkdownR2PublicImageRef {
	end: number;
	fullMatch: string;
	objectKey: string;
	start: number;
	url: string;
}

export function collectMarkdownR2PublicImageRefs(
	content: string,
	publicBaseUrl: string
): MarkdownR2PublicImageRef[] {
	const references: MarkdownR2PublicImageRef[] = [];
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

export function removeMarkdownR2PublicImageRefs(
	content: string,
	references: MarkdownR2PublicImageRef[],
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
