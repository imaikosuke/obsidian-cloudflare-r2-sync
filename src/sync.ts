import { MarkdownView, Notice, normalizePath, TFile } from "obsidian";
import type CloudflareR2SyncPlugin from "../main";
import {
	convertToWebp,
	shouldConvertToWebp,
	withWebpFileName,
} from "./convert";
import {
	getCacheControlForPreset,
	normalizeR2CachePreset,
	ObjectAlreadyExistsError,
	R2ImageClient,
} from "./r2";
import {
	formatR2ErrorForNotice,
	truncateForNotice,
} from "./r2ErrorInsight";
import {
	DEFAULT_OBJECT_KEY_TEMPLATE,
	type PluginSettings,
} from "./settings";

interface ImageReference {
	fullMatch: string;
	target: string;
	type: "markdown" | "wiki";
}

interface ResolvedImageReference {
	file: TFile;
	reference: ImageReference;
}

interface SyncCounts {
	alreadyExists: number;
	failed: number;
	skipped: number;
	trashFailed: number;
	trashed: number;
	uploaded: number;
}

/** Image file that was not uploaded because the R2 key already exists. */
interface AlreadyExistingImage {
	filePath: string;
	objectKey: string;
}

interface SyncResult {
	alreadyExistingImages: AlreadyExistingImage[];
	counts: SyncCounts;
	/** Local images to move to trash after the note text is updated. */
	filesToTrash: TFile[];
	nextContent: string;
	/** Unique truncated lines for optional detail notices. */
	failureDetailLines: string[];
}

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
	"bmp",
	"gif",
	"ico",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"webp",
]);

export async function syncActiveNoteImages(
	plugin: CloudflareR2SyncPlugin
): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		new Notice("Image sync: open a Markdown note first.");
		return;
	}

	const missingSettings = getMissingSettings(plugin);
	if (missingSettings.length > 0) {
		new Notice(`Image sync: missing ${missingSettings.join(", ")}.`);
		return;
	}

	const r2Client = createR2Client(plugin);
	if (r2Client === null) {
		new Notice("Image sync: missing secret value.");
		return;
	}

	const content = view.editor.getValue();
	const result = await syncContent(plugin, r2Client, view.file, content);

	if (result.nextContent !== content) {
		view.editor.setValue(result.nextContent);
	}

	const counts: SyncCounts = { ...result.counts };
	for (const file of result.filesToTrash) {
		try {
			await plugin.app.fileManager.trashFile(file);
			counts.trashed += 1;
		} catch {
			counts.trashFailed += 1;
		}
	}

	new Notice(formatResultNotice(counts));

	for (const line of result.failureDetailLines) {
		new Notice(line, 12_000);
	}

	for (const { filePath, objectKey } of result.alreadyExistingImages) {
		new Notice(
			`Image sync: already exists: ${filePath} (${objectKey})`
		);
	}
}

export function getMissingSettings(plugin: CloudflareR2SyncPlugin): string[] {
	const missing: string[] = [];

	if (plugin.settings.accountId.trim() === "") {
		missing.push("account ID");
	}
	if (plugin.settings.bucketName.trim() === "") {
		missing.push("bucket name");
	}
	if (plugin.settings.publicBaseUrl.trim() === "") {
		missing.push("public base URL");
	}
	if (plugin.settings.accessKeyIdSecretName.trim() === "") {
		missing.push("access key ID secret");
	}
	if (plugin.settings.secretAccessKeySecretName.trim() === "") {
		missing.push("secret access key secret");
	}

	if (
		plugin.settings.accessKeyIdSecretName.trim() !== "" &&
		plugin.app.secretStorage.getSecret(plugin.settings.accessKeyIdSecretName) ===
			null
	) {
		missing.push("access key ID value");
	}
	if (
		plugin.settings.secretAccessKeySecretName.trim() !== "" &&
		plugin.app.secretStorage.getSecret(
			plugin.settings.secretAccessKeySecretName
		) === null
	) {
		missing.push("secret access key value");
	}

	return missing;
}

export function createR2Client(
	plugin: CloudflareR2SyncPlugin
): R2ImageClient | null {
	const accessKeyId = plugin.app.secretStorage.getSecret(
		plugin.settings.accessKeyIdSecretName
	);
	const secretAccessKey = plugin.app.secretStorage.getSecret(
		plugin.settings.secretAccessKeySecretName
	);
	if (accessKeyId === null || secretAccessKey === null) {
		return null;
	}

	const preset = normalizeR2CachePreset(plugin.settings.r2UploadCachePreset);

	return new R2ImageClient({
		accessKeyId,
		accountId: plugin.settings.accountId.trim(),
		cacheControl: getCacheControlForPreset(preset),
		secretAccessKey,
	});
}

async function syncContent(
	plugin: CloudflareR2SyncPlugin,
	r2Client: R2ImageClient,
	activeFile: TFile | null,
	content: string
): Promise<SyncResult> {
	const failureDetailLines: string[] = [];
	const seenDetailLines = new Set<string>();

	const maybeFailureDetail = (rawLine: string): void => {
		if (!plugin.settings.notifyDetailedErrors) {
			return;
		}

		if (failureDetailLines.length >= 6) {
			return;
		}

		const line = truncateForNotice(rawLine);
		if (seenDetailLines.has(line)) {
			return;
		}

		seenDetailLines.add(line);
		failureDetailLines.push(line);
	};

	const alreadyExistingImages: AlreadyExistingImage[] = [];
	const filesToTrash: TFile[] = [];
	const counts: SyncCounts = {
		alreadyExists: 0,
		failed: 0,
		skipped: 0,
		trashFailed: 0,
		trashed: 0,
		uploaded: 0,
	};
	let nextContent = content;

	if (!activeFile) {
		return {
			alreadyExistingImages,
			counts: { ...counts, skipped: 1 },
			failureDetailLines,
			filesToTrash: [],
			nextContent,
		};
	}

	const sourcePath = activeFile.path;
	const references = collectImageReferences(content);
	const resolvedReferences = new Map<string, ResolvedImageReference[]>();

	for (const reference of references) {
		const file = resolveReference(plugin, reference.target, sourcePath);
		if (!file) {
			counts.skipped += 1;
			continue;
		}

		const existing = resolvedReferences.get(file.path) ?? [];
		existing.push({ file, reference });
		resolvedReferences.set(file.path, existing);
	}

	for (const groupedReferences of resolvedReferences.values()) {
		const { file } = groupedReferences[0];
		const uploadDate = new Date();

		let body: ArrayBuffer;
		let contentType: string;
		let keyFileName: string;

		if (shouldConvertToWebp(file.extension)) {
			try {
				const rawBody = await plugin.app.vault.readBinary(file);
				body = await convertToWebp(rawBody, plugin.settings.webpQuality);
			} catch {
				counts.failed += groupedReferences.length;
				maybeFailureDetail(
					"Image sync: local read or WebP conversion failed."
				);
				continue;
			}

			contentType = "image/webp";
			keyFileName = withWebpFileName(file.name);
		} else {
			body = await plugin.app.vault.readBinary(file);
			contentType = getImageContentType(file.extension);
			keyFileName = file.name;
		}

		const objectKey = buildObjectKeyFromTemplate(
			keyFileName,
			uploadDate,
			plugin.settings.objectKeyTemplate
		);
		const publicUrl = buildPublicUrl(plugin.settings.publicBaseUrl, objectKey);

		try {
			await r2Client.uploadIfAbsent({
				body,
				bucketName: plugin.settings.bucketName.trim(),
				contentType,
				key: objectKey,
			});
			counts.uploaded += 1;
			nextContent = replaceReferences(
				nextContent,
				groupedReferences.map(({ reference }) => reference),
				publicUrl
			);
			filesToTrash.push(file);
		} catch (error) {
			counts.failed += groupedReferences.length;
			if (error instanceof ObjectAlreadyExistsError) {
				counts.alreadyExists += groupedReferences.length;
				alreadyExistingImages.push({
					filePath: file.path,
					objectKey,
				});
			} else {
				maybeFailureDetail(
					`Image sync: ${formatR2ErrorForNotice(error)}`
				);
			}
		}
	}

	return {
		alreadyExistingImages,
		counts,
		failureDetailLines,
		filesToTrash,
		nextContent,
	};
}

function formatResultNotice(counts: SyncCounts): string {
	const parts = [
		`Image sync: ${counts.uploaded} uploaded, ${counts.skipped} skipped, ${counts.failed} failed`,
		`${counts.trashed} trashed`,
		`${counts.trashFailed} trash failed`,
	];

	if (counts.alreadyExists > 0) {
		parts.push(`${counts.alreadyExists} already exists`);
	}

	return `${parts.join(", ")}.`;
}

function collectImageReferences(content: string): ImageReference[] {
	const references: ImageReference[] = [];
	const markdownImagePattern = /!\[[^\]\n]*\]\(([^)\n]+)\)/g;
	const wikiImagePattern = /!\[\[([^\]\n]+)\]\]/g;
	let markdownMatch = markdownImagePattern.exec(content);
	let wikiMatch = wikiImagePattern.exec(content);

	while (markdownMatch) {
		const fullMatch = markdownMatch[0];
		const target = parseMarkdownTarget(markdownMatch[1]);
		if (target && shouldProcessTarget(target)) {
			references.push({ fullMatch, target, type: "markdown" });
		}

		markdownMatch = markdownImagePattern.exec(content);
	}

	while (wikiMatch) {
		const fullMatch = wikiMatch[0];
		const target = parseWikiTarget(wikiMatch[1]);
		if (target && shouldProcessTarget(target)) {
			references.push({ fullMatch, target, type: "wiki" });
		}

		wikiMatch = wikiImagePattern.exec(content);
	}

	return references;
}

function parseMarkdownTarget(rawTarget: string): string {
	const trimmedTarget = rawTarget.trim();
	if (trimmedTarget.startsWith("<") && trimmedTarget.endsWith(">")) {
		return trimmedTarget.slice(1, -1);
	}

	return trimmedTarget;
}

function parseWikiTarget(rawTarget: string): string {
	return rawTarget.split("|")[0].trim();
}

function shouldProcessTarget(target: string): boolean {
	if (isHttpUrl(target)) {
		return false;
	}

	return SUPPORTED_IMAGE_EXTENSIONS.has(getExtension(target));
}

function resolveReference(
	plugin: CloudflareR2SyncPlugin,
	target: string,
	sourcePath: string
): TFile | null {
	const file = plugin.app.metadataCache.getFirstLinkpathDest(
		stripSubpath(target),
		sourcePath
	);

	return file instanceof TFile ? file : null;
}

function replaceReferences(
	content: string,
	references: ImageReference[],
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

function isHttpUrl(target: string): boolean {
	const lowerTarget = target.toLowerCase();
	return lowerTarget.startsWith("http://") || lowerTarget.startsWith("https://");
}

function stripSubpath(target: string): string {
	return target.split("#")[0];
}

function getExtension(target: string): string {
	const targetWithoutSubpath = stripSubpath(target).split("?")[0];
	const dotIndex = targetWithoutSubpath.lastIndexOf(".");

	if (dotIndex < 0) {
		return "";
	}

	return targetWithoutSubpath.slice(dotIndex + 1).toLowerCase();
}

function normalizeTemplateSlashes(raw: string): string {
	let normalized = raw.trim().replace(/\\/g, "/");
	while (normalized.startsWith("/")) {
		normalized = normalized.slice(1);
	}
	while (normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	return normalized.replace(/\/+/g, "/");
}

/**
 * Migrates pre-template releases that only stored objectKeyPrefix.
 */
export function migrateLegacySettingsFromRaw(
	raw: Record<string, unknown> | null
): Partial<PluginSettings> {
	if (
		raw === null ||
		Object.prototype.hasOwnProperty.call(raw, "objectKeyTemplate")
	) {
		return {};
	}

	if (typeof raw.objectKeyPrefix !== "string") {
		return {};
	}

	const prefix = normalizeTemplateSlashes(raw.objectKeyPrefix);
	if (prefix === "") {
		return {};
	}

	return {
		objectKeyTemplate: `${prefix}/{year}/{month}/{timestamp}-{filename}`,
	};
}

export function resolveCoverObjectKeyTemplate(
	settings: PluginSettings
): string {
	const cover = normalizeTemplateSlashes(settings.coverObjectKeyTemplate ?? "");
	if (cover === "") {
		return settings.objectKeyTemplate;
	}

	return settings.coverObjectKeyTemplate;
}

/** True when cover uploads use `objectKeyTemplate` (cover field empty). */
export function isCoverObjectKeyTemplateInherited(
	settings: PluginSettings
): boolean {
	return normalizeTemplateSlashes(settings.coverObjectKeyTemplate ?? "") === "";
}

export function buildObjectKeyFromTemplate(
	fileName: string,
	date: Date,
	templateRaw: string
): string {
	const trimmedTemplate = normalizeTemplateSlashes(templateRaw);
	const template =
		trimmedTemplate === "" ? DEFAULT_OBJECT_KEY_TEMPLATE : trimmedTemplate;

	const year = String(date.getFullYear());
	const month = pad2(date.getMonth() + 1);
	const day = pad2(date.getDate());
	const hour = pad2(date.getHours());
	const minute = pad2(date.getMinutes());
	const second = pad2(date.getSeconds());
	const timestamp = `${year}${month}${day}${hour}${minute}${second}`;
	const filename = normalizeFileName(fileName);

	const vars: Record<string, string> = {
		day,
		filename,
		hour,
		minute,
		month,
		second,
		timestamp,
		year,
	};

	const replaced = template.replace(
		/\{([a-z]+)\}/gi,
		(full, token: string) => {
			const key = token.toLowerCase();
			return Object.prototype.hasOwnProperty.call(vars, key)
				? vars[key]
				: full;
		}
	);

	let objectKey = normalizePath(replaced.replace(/\\/g, "/"));
	while (objectKey.startsWith("/")) {
		objectKey = objectKey.slice(1);
	}
	objectKey = objectKey.replace(/\/+/g, "/");

	if (objectKey === "") {
		return buildObjectKeyFromTemplate(
			fileName,
			date,
			DEFAULT_OBJECT_KEY_TEMPLATE
		);
	}

	return objectKey;
}

function normalizeFileName(fileName: string): string {
	const dotIndex = fileName.lastIndexOf(".");
	const baseName = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
	const extension = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
	const normalizedBaseName = baseName
		.toLowerCase()
		.replace(/[^a-z0-9_.-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	const fallbackBaseName = normalizedBaseName === "" ? "image" : normalizedBaseName;

	return `${fallbackBaseName}${extension.replace(/[^a-z0-9.]/g, "")}`;
}

export function buildPublicUrl(publicBaseUrl: string, objectKey: string): string {
	const normalizedBaseUrl = publicBaseUrl.trim().replace(/\/+$/g, "");
	const encodedKey = normalizePath(objectKey)
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	return `${normalizedBaseUrl}/${encodedKey}`;
}

export function getObjectKeyFromPublicUrl(
	publicBaseUrl: string,
	targetUrl: string
): string | null {
	const normalizedBaseUrl = publicBaseUrl.trim().replace(/\/+$/g, "");
	if (!targetUrl.startsWith(`${normalizedBaseUrl}/`)) {
		return null;
	}

	const encodedKey = targetUrl
		.slice(normalizedBaseUrl.length + 1)
		.split(/[?#]/)[0];
	if (encodedKey.trim() === "") {
		return null;
	}

	try {
		return normalizePath(
			encodedKey
				.split("/")
				.map((segment) => decodeURIComponent(segment))
				.join("/")
		);
	} catch {
		return null;
	}
}

export function getImageContentType(extension: string): string {
	switch (extension.toLowerCase()) {
		case "bmp":
			return "image/bmp";
		case "gif":
			return "image/gif";
		case "ico":
			return "image/vnd.microsoft.icon";
		case "jpeg":
		case "jpg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "svg":
			return "image/svg+xml";
		case "webp":
			return "image/webp";
		default:
			return "application/octet-stream";
	}
}

function pad2(value: number): string {
	return value < 10 ? `0${value}` : value.toString();
}
