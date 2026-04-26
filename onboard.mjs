#!/usr/bin/env node
/**
 * Interactive onboarding: replace template names, metadata, and TypeScript symbols.
 * Usage: node onboard.mjs
 *        node onboard.mjs --check
 */

import { createReadStream } from "node:fs";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = dirname(fileURLToPath(import.meta.url));

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	".cursor",
	"dist",
	"build",
]);

const SKIP_FILE_NAMES = new Set([
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"main.js",
]);

/** @type {readonly { pattern: RegExp; label: string }[]} */
const TEMPLATE_SCAN_RULES = [
	{ pattern: /\bPluginTemplate\b/, label: "Class name PluginTemplate" },
	{ pattern: /\bTemplateSettingTab\b/, label: "Class name TemplateSettingTab" },
	{ pattern: /["']plugin-template["']/, label: 'Literal "plugin-template" (old manifest id)' },
	{ pattern: /obsidian-plugin-template/, label: "obsidian-plugin-template (old package / URL slug)" },
	{ pattern: /Plugin Template/, label: "Phrase Plugin Template" },
	{ pattern: /Plugin template\./, label: 'Phrase "Plugin template." (old manifest description)' },
	{
		pattern: /Scaffold for Obsidian plugins\. Fork and replace names/,
		label: "Old package.json description scaffold text",
	},
];

/**
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* walkFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const ent of entries) {
		const full = join(dir, ent.name);
		if (ent.isDirectory()) {
			if (SKIP_DIRS.has(ent.name)) continue;
			yield* walkFiles(full);
		} else {
			if (SKIP_FILE_NAMES.has(ent.name)) continue;
			yield full;
		}
	}
}

/**
 * @param {string} filePath
 */
async function isProbablyTextFile(filePath) {
	const stream = createReadStream(filePath, { start: 0, end: 512 });
	try {
		for await (const chunk of stream) {
			for (let i = 0; i < chunk.length; i++) {
				if (chunk[i] === 0) return false;
			}
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * @returns {Promise<{ path: string; label: string; line: number; text: string }[]>}
 */
async function scanForTemplateLeftovers(root = ROOT) {
	const hits = [];
	for await (const abs of walkFiles(root)) {
		const rel = relative(root, abs);
		const relPosix = rel.replace(/\\/g, "/");
		if (relPosix === "onboard.mjs") continue;
		if (!(await isProbablyTextFile(abs))) continue;
		let content;
		try {
			content = await readFile(abs, "utf8");
		} catch {
			continue;
		}
		const lines = content.split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			for (const rule of TEMPLATE_SCAN_RULES) {
				rule.pattern.lastIndex = 0;
				if (rule.pattern.test(line)) {
					hits.push({
						path: rel,
						label: rule.label,
						line: i + 1,
						text: line.trimEnd().slice(0, 200),
					});
				}
			}
		}
	}
	return hits;
}

/**
 * @param {string} id
 * @returns {string | null}
 */
function validatePluginId(id) {
	if (!id) return "Plugin id is required.";
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
		return "Use lowercase letters, numbers, and hyphens only (kebab-case).";
	}
	if (id.includes("obsidian")) {
		return 'Plugin id should not contain "obsidian".';
	}
	if (id.endsWith("plugin")) {
		return 'Plugin id should not end with "plugin".';
	}
	return null;
}

/**
 * @param {string} name
 * @returns {string | null}
 */
function validatePluginName(name) {
	if (!name) return "Plugin name is required.";
	if (/obsidian/i.test(name)) {
		return 'Plugin name should not include "Obsidian".';
	}
	const t = name.trim();
	if (/(^|\s)plugin$/i.test(t)) {
		return 'Plugin name should not end with "Plugin".';
	}
	if (/^obsi/i.test(t)) {
		return 'Plugin name should not start with "Obsi…".';
	}
	if (/dian$/i.test(t)) {
		return 'Plugin name should not end with "…dian".';
	}
	return null;
}

/**
 * @param {string} description
 * @returns {string | null}
 */
function validateDescription(description) {
	if (!description) return "Description is required.";
	const t = description.trim();
	if (/obsidian/i.test(t)) {
		return 'Description should not mention "Obsidian".';
	}
	if (/this\s+plugin/i.test(t)) {
		return 'Avoid "This plugin" in the description.';
	}
	if (!/[.!?)]$/.test(t)) {
		return "Description should end with ., !, ?, or ).";
	}
	return null;
}

/**
 * @param {string} name
 * @returns {string}
 */
function toPascalBase(name) {
	const parts = name
		.trim()
		.split(/[\s-]+/)
		.filter(Boolean);
	return parts
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
		.join("");
}

/**
 * @param {string} url
 * @returns {string | null}
 */
function normalizeRepoUrl(url) {
	const t = url.trim().replace(/\/+$/, "");
	if (!t) return null;
	if (!/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(t)) {
		return null;
	}
	return t.replace(/\.git$/, "");
}

/**
 * @param {string} pluginId
 * @param {string} authorUrl
 */
/** Repo slug and npm package name: `obsidian-` + manifest id (manifest id must not contain "obsidian"). */
function repoAndPackageSlug(pluginId) {
	return `obsidian-${pluginId}`;
}

function defaultGitHubRepo(pluginId, authorUrl) {
	const slug = repoAndPackageSlug(pluginId);
	const t = (authorUrl || "").trim();
	const m = t.match(/^https:\/\/github\.com\/([^/]+)(?:\/([^/]+))?/);
	if (!m) return `https://github.com/example/${slug}`;
	const owner = m[1];
	const repo = m[2];
	if (repo && repo.length > 0) return `https://github.com/${owner}/${repo}`;
	return `https://github.com/${owner}/${slug}`;
}

/**
 * @param {readline.Interface} rl
 * @param {string} question
 * @param {string} [defaultValue]
 */
async function ask(rl, question, defaultValue) {
	const hint =
		defaultValue !== undefined && defaultValue !== ""
			? ` [${defaultValue}]`
			: "";
	const line = await rl.question(`${question}${hint}: `);
	const trimmed = line.trim();
	if (trimmed === "" && defaultValue !== undefined) return defaultValue;
	return trimmed;
}

/**
 * @param {readline.Interface} rl
 * @param {string} question
 * @param {boolean} defaultBool
 */
async function askYesNo(rl, question, defaultBool) {
	const hint = defaultBool ? " [Y/n]" : " [y/N]";
	const line = await rl.question(`${question}${hint}: `);
	const t = line.trim().toLowerCase();
	if (t === "") return defaultBool;
	return t === "y" || t === "yes";
}

/**
 * @param {readline.Interface} rl
 * @param {string} question
 * @param {(value: string) => string | null} validate
 * @param {string} defaultValue
 */
async function askUntilValid(rl, question, validate, defaultValue) {
	for (;;) {
		const value = await ask(rl, question, defaultValue);
		const err = validate(value);
		if (!err) return value;
		console.error(`  ${err}`);
	}
}

/**
 * @param {unknown} data
 * @param {string} path
 */
async function writeJsonFile(path, data) {
	await writeFile(path, JSON.stringify(data, null, "\t") + "\n", "utf8");
}

/**
 * @param {object} opts
 */
async function applyOnboarding(opts) {
	const {
		pluginId,
		pluginName,
		description,
		author,
		authorUrl,
		repoUrl,
		minAppVersion,
		isDesktopOnly,
		mainClassName,
		settingTabClassName,
	} = opts;

	const manifestPath = join(ROOT, "manifest.json");
	const packagePath = join(ROOT, "package.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	const pkg = JSON.parse(await readFile(packagePath, "utf8"));

	manifest.id = pluginId;
	manifest.name = pluginName;
	manifest.description = description;
	manifest.author = author;
	manifest.authorUrl = authorUrl;
	manifest.minAppVersion = minAppVersion;
	manifest.isDesktopOnly = isDesktopOnly;

	pkg.name = repoAndPackageSlug(pluginId);
	pkg.description = description;
	pkg.author = author;
	pkg.authorUrl = authorUrl;

	await writeJsonFile(manifestPath, manifest);
	await writeJsonFile(packagePath, pkg);

	const version = manifest.version ?? "0.0.1";
	const readme = `# ${pluginName}

${description}

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-${version}-blue.svg)](${repoUrl}/releases)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7c3aed.svg)](https://obsidian.md)

## License

MIT
`;
	await writeFile(join(ROOT, "README.md"), readme, "utf8");

	const year = new Date().getFullYear();
	const licensePath = join(ROOT, "LICENSE");
	let licenseText = await readFile(licensePath, "utf8");
	licenseText = licenseText.replace(
		/Copyright \(c\) \d{4} .+/,
		`Copyright (c) ${year} ${author}`,
	);
	await writeFile(licensePath, licenseText, "utf8");

	const tsFiles = [
		join(ROOT, "main.ts"),
		join(ROOT, "src", "commands", "index.ts"),
		join(ROOT, "src", "ui", "SettingsTab.ts"),
	];

	for (const file of tsFiles) {
		let text = await readFile(file, "utf8");
		text = text.replaceAll("PluginTemplate", mainClassName);
		text = text.replaceAll("TemplateSettingTab", settingTabClassName);
		text = text.replace(
			/\/\*\*[\s\S]*?Template entry:[\s\S]*?\*\/\s*/,
			"/**\n * Plugin entry.\n */\n",
		);
		await writeFile(file, text, "utf8");
	}
}

async function runCheckCommand() {
	const hits = await scanForTemplateLeftovers();
	if (hits.length === 0) {
		console.log("No template placeholders detected.");
		return 0;
	}
	console.error("Template placeholders still found:\n");
	for (const h of hits) {
		console.error(`  ${h.path}:${h.line}  ${h.label}`);
		console.error(`    ${h.text}`);
	}
	console.error(`\n${hits.length} hit(s).`);
	return 1;
}

/**
 * @returns {Promise<number>} exit code (0 = ok)
 */
async function runInteractive() {
	if (!input.isTTY) {
		console.error(
			"Interactive onboarding needs a real terminal (stdin is not a TTY).\n" +
				"Run this in Terminal.app / iTerm / Cursor’s integrated shell, for example:\n" +
				"  node onboard.mjs\n" +
				"  pnpm run setup\n",
		);
		return 1;
	}

	const manifestPath = join(ROOT, "manifest.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

	const rl = readline.createInterface({
		input,
		output,
		terminal: input.isTTY,
	});

	try {
		console.log("Obsidian plugin onboarding — answer prompts (Enter keeps default).\n");

		const pluginId = await askUntilValid(
			rl,
			"Plugin id (kebab-case, manifest id)",
			validatePluginId,
			manifest.id,
		);

		const pluginName = await askUntilValid(
			rl,
			"Plugin display name (manifest name)",
			validatePluginName,
			manifest.name,
		);

		const description = await askUntilValid(
			rl,
			"Short description (no Obsidian; end with . ! ? or ))",
			validateDescription,
			manifest.description,
		);

		const author = await ask(rl, "Author name", manifest.author);
		if (!author) {
			console.error("Author is required.");
			return 1;
		}

		const authorUrl = await ask(rl, "Author URL", manifest.authorUrl);
		if (!authorUrl) {
			console.error("Author URL is required.");
			return 1;
		}

		const defaultRepo = defaultGitHubRepo(pluginId, authorUrl);

		let repoUrlStr = await ask(
			rl,
			"GitHub repository URL (for README release badge)",
			defaultRepo,
		);
		let repoUrl = normalizeRepoUrl(repoUrlStr);
		while (!repoUrl) {
			console.error("  Use https://github.com/owner/repo");
			repoUrlStr = await ask(rl, "GitHub repository URL", defaultRepo);
			repoUrl = normalizeRepoUrl(repoUrlStr);
		}

		const minAppVersion = await ask(
			rl,
			"Minimum Obsidian app version (minAppVersion)",
			manifest.minAppVersion,
		);
		if (!minAppVersion) {
			console.error("minAppVersion is required.");
			return 1;
		}

		const isDesktopOnly = await askYesNo(
			rl,
			"Desktop only (isDesktopOnly)",
			Boolean(manifest.isDesktopOnly),
		);

		const base = toPascalBase(pluginName);
		const suggestedMain = `${base}Plugin`;
		const suggestedTab = `${base}SettingTab`;

		console.log(`\nSuggested main class: ${suggestedMain}`);
		console.log(`Suggested settings tab class: ${suggestedTab}`);

		const mainClassName = await ask(rl, "Main Plugin class name", suggestedMain);
		if (!mainClassName || !/^[A-Z][A-Za-z0-9]*$/.test(mainClassName)) {
			console.error("Invalid class name (PascalCase).");
			return 1;
		}

		const settingTabClassName = await ask(
			rl,
			"Settings tab class name",
			suggestedTab,
		);
		if (!settingTabClassName || !/^[A-Z][A-Za-z0-9]*$/.test(settingTabClassName)) {
			console.error("Invalid class name (PascalCase).");
			return 1;
		}

		await applyOnboarding({
			pluginId,
			pluginName,
			description,
			author,
			authorUrl,
			repoUrl,
			minAppVersion,
			isDesktopOnly,
			mainClassName,
			settingTabClassName,
		});

		console.log("\nWrote manifest.json, package.json, README.md, LICENSE, and TypeScript files.");

		return await runCheckCommand();
	} finally {
		rl.close();
	}
}

const args = process.argv.slice(2);
const exitCode = args.includes("--check")
	? await runCheckCommand()
	: await runInteractive();
process.exit(exitCode);
