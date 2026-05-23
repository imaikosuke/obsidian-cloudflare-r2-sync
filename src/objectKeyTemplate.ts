import { normalizePath, TFile } from "obsidian";
import { DEFAULT_OBJECT_KEY_TEMPLATE, type PluginSettings } from "./settings";

const NOTE_TEMPLATE_FALLBACK = "untitled";
const BODY_HASH_HEX_LENGTH = 12;

export interface ObjectKeyTemplateContext {
	slug: string;
	notePath: string;
	hash?: string;
	uuid?: string;
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

function normalizeSegmentName(segment: string): string {
	const normalized = segment
		.toLowerCase()
		.replace(/[^a-z0-9_.-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

	return normalized === "" ? NOTE_TEMPLATE_FALLBACK : normalized;
}

function stripExtension(path: string): string {
	const dotIndex = path.lastIndexOf(".");
	return dotIndex >= 0 ? path.slice(0, dotIndex) : path;
}

export function buildNoteTemplateVars(
	note: TFile | null
): Pick<ObjectKeyTemplateContext, "slug" | "notePath"> {
	if (note === null) {
		return {
			notePath: NOTE_TEMPLATE_FALLBACK,
			slug: NOTE_TEMPLATE_FALLBACK,
		};
	}

	const basename = stripExtension(note.name);
	const slug = normalizeSegmentName(basename);
	const segments = stripExtension(note.path)
		.split("/")
		.map((segment) => normalizeSegmentName(segment))
		.filter((segment) => segment !== "");
	const notePath =
		segments.length > 0 ? segments.join("/") : NOTE_TEMPLATE_FALLBACK;

	return {
		notePath,
		slug,
	};
}

function templateUsesToken(templateRaw: string, token: string): boolean {
	return new RegExp(`\\{${token}\\}`, "i").test(templateRaw);
}

async function computeBodyHashShort(body: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", body);
	const bytes = new Uint8Array(digest);
	let hex = "";

	for (const byte of bytes) {
		const hexByte = byte.toString(16);
		hex += hexByte.length === 1 ? `0${hexByte}` : hexByte;
	}

	return hex.slice(0, BODY_HASH_HEX_LENGTH);
}

function createUploadUuid(): string {
	return crypto.randomUUID().replace(/-/g, "");
}

export async function resolveObjectKeyTemplateContext(
	note: TFile | null,
	body: ArrayBuffer,
	templateRaw: string
): Promise<ObjectKeyTemplateContext> {
	const context: ObjectKeyTemplateContext = {
		...buildNoteTemplateVars(note),
	};

	if (templateUsesToken(templateRaw, "hash")) {
		context.hash = await computeBodyHashShort(body);
	}

	if (templateUsesToken(templateRaw, "uuid")) {
		context.uuid = createUploadUuid();
	}

	return context;
}

function normalizeFileName(fileName: string): string {
	const dotIndex = fileName.lastIndexOf(".");
	const baseName = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
	const extension = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
	const normalizedBaseName = normalizeSegmentName(baseName);
	const fallbackBaseName =
		normalizedBaseName === NOTE_TEMPLATE_FALLBACK ? "image" : normalizedBaseName;

	return `${fallbackBaseName}${extension.replace(/[^a-z0-9.]/g, "")}`;
}

function pad2(value: number): string {
	return value < 10 ? `0${value}` : value.toString();
}

function buildTemplateVars(
	fileName: string,
	date: Date,
	context?: ObjectKeyTemplateContext
): Record<string, string> {
	const year = String(date.getFullYear());
	const month = pad2(date.getMonth() + 1);
	const day = pad2(date.getDate());
	const hour = pad2(date.getHours());
	const minute = pad2(date.getMinutes());
	const second = pad2(date.getSeconds());
	const timestamp = `${year}${month}${day}${hour}${minute}${second}`;
	const filename = normalizeFileName(fileName);
	const noteVars: ObjectKeyTemplateContext = context ?? {
		...buildNoteTemplateVars(null),
	};

	const vars: Record<string, string> = {
		day,
		filename,
		hash: noteVars.hash ?? "",
		hour,
		minute,
		month,
		notepath: noteVars.notePath,
		second,
		slug: noteVars.slug,
		timestamp,
		uuid: noteVars.uuid ?? "",
		year,
	};

	return vars;
}

export async function buildObjectKeyFromTemplate(
	fileName: string,
	date: Date,
	templateRaw: string,
	context?: ObjectKeyTemplateContext
): Promise<string> {
	const trimmedTemplate = normalizeTemplateSlashes(templateRaw);
	const template =
		trimmedTemplate === "" ? DEFAULT_OBJECT_KEY_TEMPLATE : trimmedTemplate;
	const vars = buildTemplateVars(fileName, date, context);

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
			DEFAULT_OBJECT_KEY_TEMPLATE,
			context
		);
	}

	return objectKey;
}
