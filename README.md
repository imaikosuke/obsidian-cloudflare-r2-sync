# Cloudflare R2 Sync

Upload local note images to Cloudflare R2 and replace their links with public URLs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.2-blue.svg)](https://github.com/imaikosuke/obsidian-cloudflare-r2-sync/releases)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7c3aed.svg)](https://obsidian.md)

> [日本語ver](README.ja.md)

## Overview

Cloudflare R2 Sync moves local images out of your vault and into Cloudflare R2. When you run a sync, the plugin finds local image references in the active note, uploads them to R2, replaces the links with public URLs, and moves the local files to Obsidian trash.

Key features:

- **Sync images to R2** — upload all local images referenced in the active note at once.
- **Auto-upload on drop** — drag an image into the editor and it uploads immediately.
- **Upload cover image** — pick an image and write its public URL to YAML frontmatter.
- **Delete R2 images** — remove selected R2 objects and clean up their note references.
- **WebP conversion** — optionally re-encode `png`, `jpeg`, `jpg`, and `bmp` to WebP before upload.

Supported image reference formats:

- `![alt](path/to/image.png)`
- `![alt](<path/to/image.png>)`
- `![[path/to/image.png]]`
- `![[path/to/image.png|alias]]`

Remote `http://` and `https://` URLs are skipped automatically.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Requirements](#requirements)
3. [Cloudflare setup](#cloudflare-setup)
4. [Store credentials in Obsidian](#store-credentials-in-obsidian)
5. [Plugin settings](#plugin-settings)
6. [Usage](#usage)
7. [Upload paths](#upload-paths)
8. [Troubleshooting](#troubleshooting)
9. [Development](#development)

## Quick Start

1. **Create an R2 bucket** with a public URL — [details](#create-a-bucket).
2. **Configure CORS** on the bucket so Obsidian can upload — [details](#configure-cors).
3. **Create R2 API access keys** (S3-compatible) — [details](#create-r2-api-access-keys).
4. **Store the keys as Obsidian secrets** — [details](#store-credentials-in-obsidian).
5. **Configure the plugin** with your account ID, bucket name, public URL, and secret names — [details](#plugin-settings).
6. Open a note with local images and run **Sync images to r2** from the command palette.

## Requirements

- Obsidian `1.11.4` or later (desktop only)
- A Cloudflare account with R2 enabled
- An R2 bucket with a public URL configured
- An R2 S3-compatible access key pair (write and delete permissions)

## Cloudflare setup

### Create a bucket

1. Open the Cloudflare dashboard → **R2** → **Create bucket**.
2. Set the bucket name (for example `obsidian`), leave location as **Automatic** and storage class as **Standard**.
3. After creation, open the bucket's **Settings** tab and configure a public URL (R2 custom domain or the public bucket URL).
4. Keep the public URL — you will enter it in the plugin as **Public base URL**.

### Create R2 API access keys

The plugin authenticates with S3-compatible credentials, not a Cloudflare API token.

1. Dashboard → **R2** → **Manage R2 API Tokens**.
2. Open **Access keys** → **Create access key**.
3. Give the key permission to **write and delete** objects in your bucket.
4. Copy **Access Key ID** and **Secret Access Key** immediately — the secret is shown only once.

**Where to find your Account ID:** Dashboard → **R2** overview, or **Workers & Pages** → **Overview**. It is a 32-character hex string. See [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/).

### Configure CORS

The plugin sends `PUT` and `DELETE` requests directly to the R2 S3 API from Obsidian desktop (origin `app://obsidian.md`). Without a CORS policy the bucket rejects these requests, and every upload or delete fails silently.

1. Dashboard → **R2** → select your bucket → **Settings** → **CORS policy**.
2. Paste the following JSON and save:

```json
[
  {
    "AllowedOrigins": ["app://obsidian.md"],
    "AllowedMethods": ["PUT", "DELETE"],
    "AllowedHeaders": ["*"]
  }
]
```

### Values to collect

Before moving on, have these five values ready:

| Value | Where to find it |
| --- | --- |
| Account ID | R2 overview or Workers & Pages overview |
| Bucket name | The name you chose |
| Public base URL | Bucket Settings → public URL |
| Access Key ID | Copied when creating the access key |
| Secret Access Key | Copied when creating the access key |

## Store credentials in Obsidian

The plugin never stores raw credentials in its settings. Instead it reads them from Obsidian's built-in secret storage. Create two secrets before configuring the plugin:

1. Open **Obsidian Settings** → find the secret storage or keychain section.
2. Create a secret for the R2 Access Key ID, for example named `r2-access-key-id`.
3. Create a secret for the R2 Secret Access Key, for example named `r2-secret-access-key`.

You will pick these names in the plugin settings. The plugin never touches the secret values directly.

## Plugin settings

Open **Settings** → **Community plugins** → **Cloudflare R2 Sync**.

### R2 connection

| Setting | Description |
| --- | --- |
| **Account ID** | Your 32-character Cloudflare account ID. |
| **Bucket name** | The R2 bucket that receives uploaded images. |
| **Public base URL** | URL prefix used in replaced links, for example `https://images.example.com`. |
| **Object key template** | R2 object path pattern for article images (see [Upload paths](#upload-paths)). Default: `{year}/{month}/{timestamp}-{filename}`. |
| **Cover object key template** | Optional separate path pattern for cover uploads. Leave empty to reuse the article template. |
| **Cover frontmatter property** | YAML key where **Upload cover image** writes the public URL. Default: `cover`. |
| **Upload cache control** | `Cache-Control` applied to every uploaded object. Default: 1 year, immutable. |
| **Access key ID secret** | Name of the Obsidian secret containing the R2 access key ID. |
| **Secret access key secret** | Name of the Obsidian secret containing the R2 secret access key. |

### Automation

| Setting | Default | Description |
| --- | --- | --- |
| **Auto-upload on drop** | On | Upload images to R2 when dropped into the editor. Disable for manual-only workflow. |
| **Sync preview before upload** | Off | Show a preview modal before any upload so you can review object keys and URLs, then select which images to upload. |

### Image conversion

| Setting | Default | Description |
| --- | --- | --- |
| **Convert article images to webp** | On | Re-encode `png`, `jpeg`, `jpg`, `bmp` to WebP for sync and drop uploads. Other formats upload unchanged. |
| **Webp quality (article images)** | 0.8 | Quality slider (0.5–1). Visible only when conversion is on. |
| **Convert cover images to webp** | Off | Re-encode raster formats to WebP on cover upload. |
| **Webp quality (cover images)** | 0.8 | Quality slider (0.5–1). Visible only when conversion is on. |

### Error reporting

| Setting | Default | Description |
| --- | --- | --- |
| **Detailed error notices** | Off | Show extra notices with error category, HTTP status, and a short hint after a failure. Useful for support screenshots. |

## Usage

### Drop images into the editor

1. Open a Markdown note and focus the editor.
2. Drag one or more images from your file manager into the editor.
3. With **Auto-upload on drop** enabled, the images upload to R2 and `![](…)` links appear at the drop position.
4. If **Sync preview before upload** is on, a preview modal opens first so you can select which images to upload.
5. If an upload fails, the file is saved as a normal attachment and a local embed is inserted instead.

### Sync images in a note

1. Open the Markdown note that contains local image references.
2. Run **Sync images to r2** from the command palette, or click the ribbon icon.
3. If **Sync preview before upload** is on, review the detected images in the preview modal and click **Upload selected**.
4. Wait for the result notice.

Example result notice:

```
Image sync: 3 uploaded, 1 skipped, 0 failed, 3 trashed, 0 trash failed.
```

Successfully uploaded images have their local links replaced with public R2 URLs. The original local files are moved to Obsidian trash (not permanently deleted). If a local file has multiple references in the note, it uploads once and all references are replaced. Wiki embeds are converted to Markdown links (for example `![[image.png|alias]]` becomes `![alias](https://…)`).

### Upload a cover image

1. Open the note that should receive a cover URL in its frontmatter.
2. Run **Upload cover image** from the command palette.
3. Choose a supported image file (`png`, `jpeg`, `jpg`, `bmp`, `gif`, `ico`, `webp`, `svg`).
4. If **Sync preview before upload** is on, confirm in the preview modal.
5. The plugin uploads the file using the **Cover object key template** (or the article template if the cover template is empty) and writes the public URL to the frontmatter property configured under **Cover frontmatter property**.

### Delete uploaded images

1. Open a note containing R2 image links created by this plugin (and/or a frontmatter cover URL).
2. Run **Delete r2 images** from the command palette.
3. Review the detected images in the preview modal, select the ones to delete, and click **Delete selected**.
4. Successfully deleted objects are removed from R2. Their Markdown links are stripped from the note, and a deleted cover URL removes the matching frontmatter line.

The delete command finds every reference whose URL starts with **Public base URL**, including:

- Markdown image links: `![alt](https://…)` and angle-bracket variants.
- A frontmatter line whose key matches **Cover frontmatter property** and whose value is that public URL.

## Upload paths

Both article images and cover images use the same placeholder rules but can have separate templates.

### Placeholders

| Group | Placeholders |
| --- | --- |
| Date and time | `{year}`, `{month}`, `{day}`, `{hour}`, `{minute}`, `{second}`, `{timestamp}` |
| File | `{filename}` |
| Note | `{slug}`, `{notepath}` |
| Upload | `{hash}`, `{uuid}` |

- `{timestamp}` — compact local time: `YYYYMMDDHHmmss`.
- `{filename}` — original file name normalized to lowercase, safe characters, with the final extension set to `.webp` when conversion is on.
- `{slug}` — active note file name without extension, normalized (for example `my-post` from `My Post.md`).
- `{notepath}` — vault-relative note path without extension, each segment normalized (for example `blog/my-post` from `blog/My Post.md`).
- `{hash}` — first 12 hex characters of the SHA-256 hash of the uploaded bytes. Computed only when present in the template.
- `{uuid}` — a new UUID v4 (no hyphens) per upload. Generated only when present in the template.

When the active note cannot be resolved, `{slug}` and `{notepath}` fall back to `untitled`.

### Article body images (`Object key template`)

Default: `{year}/{month}/{timestamp}-{filename}`

Example — syncing `My Screenshot.png` on 15 Apr 2026 at 14:30:22 with **Convert article images to webp** on:

```
2026/04/20260415143022-my-screenshot.webp
```

Example with note `blog/My Post.md` and template `{slug}/{filename}`:

```
my-post/20260415143022-my-screenshot.webp
```

### Cover images (`Cover object key template`)

Leave empty to reuse the article template. To give covers their own prefix:

| Setting | Value |
| --- | --- |
| Object key template | `{year}/{month}/{timestamp}-{filename}` |
| Cover object key template | `cover/{year}/{month}/{timestamp}-{filename}` |

Uploading `hero.png` on 15 Apr 2026 at 14:30:22 with **Convert cover images to webp** on:

```
cover/2026/04/20260415143022-hero.webp
```

Leading slashes in templates are normalized away.

## Development

### Build

The repository uses [mise](https://mise.jdx.dev) to manage the Node.js version (`mise.toml` pins Node 24) and [pnpm](https://pnpm.io) as the package manager (pinned in `package.json`).

```bash
# Install mise (if not already installed), then let it set up Node:
mise install

# Install dependencies and run all checks:
pnpm install
pnpm check    # TypeScript, ESLint, production bundle
```

`pnpm build` runs typecheck and esbuild. `pnpm dev` runs the esbuild watcher.

### Source layout

| Area | Files |
| --- | --- |
| R2 connection | `pluginR2.ts`, `r2.ts` |
| URLs and keys | `publicR2Url.ts`, `objectKeyTemplate.ts` |
| Images | `imagePaths.ts`, `imageContentType.ts`, `convert.ts`, `droppedImageFiles.ts` |
| Markdown / vault | `noteBodyImageRefs.ts`, `noteMarkdownR2PublicLinks.ts` |
| Features | `syncActiveNoteImages.ts`, `editorDropUpload.ts`, `cover.ts`, `deleteActiveNoteR2Images.ts` |
| Errors | `r2ErrorInsight.ts` |
| Settings | `settings.ts`, `ui/SettingsTab.ts` |
| UI | `ui/R2ImageDeleteModal.ts`, `ui/coverImagePicker.ts` |
| Commands | `commands/index.ts` |

## License

MIT
