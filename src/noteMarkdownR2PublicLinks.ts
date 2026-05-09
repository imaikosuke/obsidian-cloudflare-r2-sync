import { parseMarkdownTarget } from "./imagePaths";
import { getObjectKeyFromPublicUrl } from "./publicR2Url";

export interface MarkdownR2PublicImageRef {
	end: number;
	fullMatch: string;
	objectKey: string;
	start: number;
	url: string;
}

function stripYamlStringScalar(raw: string): string {
	const t = raw.trim();
	if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
		return t.slice(1, -1);
	}

	if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
		return t.slice(1, -1);
	}

	return t;
}

/**
 * Leading YAML `---` block only; returns inner text start index in `content`.
 */
function matchLeadingYamlFrontmatter(
	content: string
): { inner: string; innerStart: number } | null {
	const m = /^(\ufeff?---\s*\r?\n)([\s\S]*?)(\r?\n---\s*(?:\r?\n|$))/.exec(
		content
	);
	if (m === null) {
		return null;
	}

	return {
		inner: m[2],
		innerStart: m.index + m[1].length,
	};
}

function collectFrontmatterCoverR2PublicRefs(
	content: string,
	publicBaseUrl: string
): MarkdownR2PublicImageRef[] {
	const fm = matchLeadingYamlFrontmatter(content);
	if (fm === null) {
		return [];
	}

	const { inner, innerStart } = fm;
	const references: MarkdownR2PublicImageRef[] = [];
	let i = 0;

	while (i < inner.length) {
		const lineEndRel = inner.indexOf("\n", i);
		const hasNl = lineEndRel >= 0;
		const line = (hasNl ? inner.slice(i, lineEndRel) : inner.slice(i))
			.replace(/\r$/, "");
		const lineAbsStart = innerStart + i;
		const lineAbsEndExclusive = innerStart + (hasNl ? lineEndRel : inner.length);

		const coverMatch = /^\s*cover\s*:\s*(.+)$/.exec(line);
		if (coverMatch) {
			const url = stripYamlStringScalar(coverMatch[1].trim());
			const objectKey = getObjectKeyFromPublicUrl(publicBaseUrl, url);
			if (objectKey !== null) {
				const removeEnd = hasNl ? lineAbsEndExclusive + 1 : lineAbsEndExclusive;
				const fullMatch = hasNl ? `${line}\n` : line;
				references.push({
					end: removeEnd,
					fullMatch,
					objectKey,
					start: lineAbsStart,
					url,
				});
			}
		}

		if (!hasNl) {
			break;
		}

		i = lineEndRel + 1;
	}

	return references;
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

	references.push(...collectFrontmatterCoverR2PublicRefs(content, publicBaseUrl));

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
