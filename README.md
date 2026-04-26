# Obsidian Plugin Template

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/imaikosuke/obsidian-plugin-template/releases)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7c3aed.svg)](https://obsidian.md)

A minimal, production-minded starter for [Obsidian](https://obsidian.md) plugins. It is published as a **public GitHub template repository**—create a new repo from it with **Use this template** (see [Getting started](#getting-started)). The template bundles TypeScript with [esbuild](https://esbuild.github.io/), enforces quality with ESLint (including Obsidian-specific rules), and includes a small sample plugin surface: persisted settings, a settings tab, a ribbon action, and a command palette entry.

## Tech stack

| Area | Choice |
|------|--------|
| Language | **TypeScript** (strict mode, `noImplicitAny`, null checks) |
| Bundler | **esbuild** — watches `main.ts` in dev, outputs CommonJS `main.js` with Obsidian/CodeMirror/electron externals |
| Package manager | **pnpm** (version pinned in `packageManager`) |
| Linting | **ESLint 9** flat config — `@eslint/js`, `typescript-eslint`, and **`eslint-plugin-obsidianmd`** (recommended preset) |
| Types | **`obsidian`** package for the app API |
| Tooling | **`tsc --noEmit`** for type-checking; esbuild handles the emitted bundle |

**Build output:** `main.js` (and inline source maps in dev). The vault loads `main.js`, `manifest.json`, and `styles.css` if present.

**Project layout (starting points):**

- `main.ts` — plugin class entry; loads settings and wires the UI and commands.
- `src/settings.ts` — settings type and defaults.
- `src/ui/SettingsTab.ts` — sample settings panel.
- `src/commands/index.ts` — ribbon icon and command registration.
- `manifest.json` / `versions.json` — plugin id, version, and minimum app version mapping for releases.
- `onboard.mjs` — interactive rename of template strings across the repo.
- `esbuild.config.mjs`, `eslint.config.mjs`, `tsconfig.json` — build and quality config.
- `release.sh` — optional local release helper (runs checks, bumps version via npm script, pushes tag for CI).

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [pnpm](https://pnpm.io/) (use the version declared in `package.json` if you use Corepack: `corepack enable`)

### 1. Create a new repository from this template

On GitHub, open this repository and click **Use this template** → **Create a new repository**. Pick an owner, repository name, and visibility, then create it. That gives you a fresh repo without fork lineage to the template.

Clone your new repository locally:

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

To contribute changes *back to this template*, use a normal fork and pull requests. For building your own plugin, **Use this template** is the intended path.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Run onboarding (rename the template)

The template uses placeholder names (`PluginTemplate`, `plugin-template`, etc.). Replace them in one pass:

```bash
pnpm setup
```

This runs `onboard.mjs` interactively: it updates `manifest.json`, `package.json`, TypeScript symbols, and related text across the project.

To verify nothing obvious was left as template text:

```bash
pnpm setup:check
```

### 4. Develop with hot reload

Start the esbuild watcher:

```bash
pnpm dev
```

Point Obsidian at your plugin folder (symlink or copy the repo into `<Vault>/.obsidian/plugins/<your-plugin-id>/`). Reload Obsidian when you change code, or rely on your usual workflow; the watcher rebuilds `main.js` on save.

### 5. Quality and production build

```bash
pnpm type      # TypeScript only
pnpm lint      # ESLint
pnpm build     # type-check + production bundle (minified, no inline source map)
pnpm check     # type + lint + build
```

### 6. Releases (optional)

If you use the included script and a GitHub Actions workflow that triggers on tags, you can bump and push with:

```bash
./release.sh patch   # or minor, major, or an explicit SemVer
```

Adjust the workflow and branching model to match your repository.

## License

MIT
