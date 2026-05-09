import { normalizePath } from "obsidian";
import { DEFAULT_OBJECT_KEY_TEMPLATE, type PluginSettings } from "./settings";

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

function pad2(value: number): string {
	return value < 10 ? `0${value}` : value.toString();
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
