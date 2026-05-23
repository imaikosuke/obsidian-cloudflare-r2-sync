# Cloudflare R2 Sync

Sync local note images to Cloudflare R2.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](https://github.com/imaikosuke/obsidian-cloudflare-r2-sync/releases)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7c3aed.svg)](https://obsidian.md)

## What it does

Cloudflare R2 Sync uploads local image files referenced from the active Markdown note to Cloudflare R2, replaces only the successfully uploaded image links with public URLs, then moves the uploaded local files to Obsidian trash.

You can also **drop image files into the Markdown editor** so they upload to R2 and appear as `![](public URL)` at the drop position (see **Auto-upload on drop** in settings). If an upload fails, the image is saved as a normal vault attachment and linked locally instead.

**Article body images:** For **Sync images to r2** and **Auto-upload on drop**, you can choose whether `png`, `jpeg`, `jpg`, and `bmp` are re-encoded to **WebP** before upload (**Convert article images to webp** in settings; on by default). When conversion is on, quality is configurable (**Webp quality**). When conversion is off, those formats upload unchanged (same as other recognized image extensions: `gif`, `ico`, `webp`, `svg`).

**Cover images:** run **Upload cover image** to pick a supported image from disk (`png`, `jpeg`, `jpg`, `bmp`, `gif`, `ico`, `webp`, `svg`); the file is uploaded and the public URL is written to a YAML frontmatter property (default **`cover`**; configurable as **Cover frontmatter property** in settings). You can optionally re-encode `png`, `jpeg`, `jpg`, and `bmp` to **WebP** before upload (**Convert cover images to webp** in settings; off by default). When conversion is on, quality is configurable (**Webp quality (cover images)**). You can store cover objects under a different R2 path from article body images (see **Cover object key template** below). **Delete r2 images** scans the same frontmatter key for URLs under **Public base URL** (see **Delete uploaded images** below).

Supported image references:

- Markdown images: `![alt](path/to/image.png)`
- Markdown images with angle brackets: `![alt](<path/to/image.png>)`
- Wiki embeds: `![[path/to/image.png]]`
- Wiki embeds with aliases: `![[path/to/image.png|alias]]`

Remote `http://` and `https://` image URLs are skipped.

## Requirements

- Obsidian `1.11.4` or later
- Desktop Obsidian
- A Cloudflare account with R2 enabled
- An R2 bucket
- An R2 access key pair that can upload and delete objects
- A public URL for the bucket, such as an R2 custom domain or public bucket URL

## Cloudflare setup

### Create a bucket (what to choose)

In the dashboard, open **R2** → **Create bucket**. For use with this plugin, set:

- **Bucket name**: Any permanent name you like (for example `obsidian`).
- **Location**: **Automatic**.
- **Default storage class**: **Standard**.

1. Create the bucket with those choices.
2. Select Settings tab.
3. Configure a public URL for the bucket.
4. Create R2 credentials with permission to upload and delete objects in the bucket.
5. Keep the following values ready:
   - Cloudflare account ID
   - R2 bucket name
   - Public base URL
   - Access key ID
   - Secret access key

### Where to find the account ID and R2 access keys

**Account ID** is your Cloudflare account identifier (a 32-character hex string). The plugin builds the R2 S3 endpoint `https://<account_id>.r2.cloudflarestorage.com`, so it must match the account that owns the bucket.

- Dashboard → **R2** → the overview page usually shows **Account ID** (often in a summary or account-details panel).
- Alternatively: **Workers & Pages** → **Overview** → copy **Account ID**.
- Same value as **Account ID** on **Websites** → your domain → **Overview**. See Cloudflare’s guide: [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/).

**Access Key ID** and **Secret Access Key** are the S3-compatible pair used to sign R2 requests (not an API Bearer token).

- Dashboard → **R2** → **Manage R2 API Tokens** (from the R2 overview or sidebar).
- Open the **Access keys** section (wording may vary slightly) → **Create access key**.
- Copy **Access Key ID** and **Secret Access Key** immediately; the secret is shown only once. Give the key permission to write and delete objects in your bucket (or broader R2 permissions if you prefer).

In the plugin, **Access key ID secret** and **Secret access key secret** are not the raw Cloudflare strings. They are the **names of Obsidian secrets** that store those two values. Create those secrets first, then pick their names in the plugin settings.

The access key ID and secret access key should not be pasted into normal plugin text fields. Store the values only as Obsidian secrets by following the next section.

## Store credentials in Obsidian

This plugin uses Obsidian secret storage. The settings screen stores only the names of the secrets, not the secret values.

1. Open Obsidian settings.
2. Open the secret storage or keychain area.
3. Create one secret for the R2 access key ID.
4. Create another secret for the R2 secret access key.
5. Give both secrets clear names, for example:
   - `cloudflare-r2-access-key-id`
   - `cloudflare-r2-secret-access-key`

Do not paste secret values into normal text settings.

## Plugin settings

Open `Settings` → `Community plugins` → `Cloudflare R2 Sync` and configure:

Each successful `PutObject` sets object `Cache-Control` from the plugin setting **Upload cache control** (default matches `public, max-age=31536000, immutable`). Your Cloudflare cache rules may still override at the edge.

Connection, upload paths, and secrets:

- `Account ID`: Your Cloudflare account ID.
- `Bucket name`: The R2 bucket to upload images to.
- `Public base URL`: The URL prefix used in the replaced Markdown links, for example `https://images.example.com`.
- `Object key template`: Path pattern for **article body images** synced with **Sync images to r2** or **Auto-upload on drop** (placeholders: `{year}`, `{month}`, `{day}`, `{hour}`, `{minute}`, `{second}`, `{timestamp}`, `{filename}`).
- `Cover object key template`: Optional path pattern used only for **Upload cover image**. Same placeholders as above. Leave empty to reuse `Object key template`.
- `Cover frontmatter property`: YAML key where **Upload cover image** writes the public URL, and where **Delete r2 images** looks for a matching cover URL. Leave empty to use `cover`.
- `Upload cache control`: `Cache-Control` applied to each successful upload.
- `Access key ID secret`: Select the Obsidian secret that contains the R2 access key ID.
- `Secret access key secret`: Select the Obsidian secret that contains the R2 secret access key.

Automation:

- `Auto-upload on drop` (on by default): When you drag image files into the Markdown editor, the plugin intercepts the drop, uploads using the same rules as **Sync images to r2** (including optional WebP conversion for body images per **Convert article images to webp**, and the **Object key template**), and inserts markdown at the drop position. Turn this off if you only want manual sync. If R2 credentials or other required settings are missing, Obsidian’s normal attachment behavior runs instead.

Image conversion:

- `Convert article images to webp` (on by default): When enabled, `png` / `jpeg` / `jpg` / `bmp` are re-encoded to WebP for **Sync images to r2** and **Auto-upload on drop**. When disabled, those files upload in their original format.
- `Webp quality (article images)`: Slider from 0.5 to 1. Used only when **Convert article images to webp** is on.
- `Convert cover images to webp` (off by default): When enabled, `png` / `jpeg` / `jpg` / `bmp` are re-encoded to WebP for **Upload cover image**. When disabled, the selected file uploads in its original format. Other recognized cover formats (`gif`, `ico`, `webp`, `svg`) always upload unchanged.
- `Webp quality (cover images)`: Slider from 0.5 to 1. Used only when **Convert cover images to webp** is on.

Error reporting:

- `Detailed error notices` (off by default): When an R2 request or local read fails, or WebP conversion fails while **Convert article images to webp** or **Convert cover images to webp** is on, show extra notices with a short category (for example credential / signature, bucket or 404, permission / 403, timeout, network), optional HTTP status or error code, and a brief hint. Useful for screenshots when asking for support. **Image sync** shows up to six unique detail lines after the summary notice; **Delete r2 images**, **Upload cover image**, and **drop uploads** append detail to the failure notice when enabled.

## Usage

### Drop images into the editor

1. Open a Markdown note and focus the editor.
2. Drag one or more supported images from your file manager onto the note. With **Auto-upload on drop** enabled and R2 configured, they upload and `![](…)` links are inserted where you dropped them.
3. If upload fails (network, duplicate object key, and so on), the file is saved under your attachment settings and a local embed is inserted. With **Detailed error notices** on, you may see an extra notice with failure details.

### Upload images

1. Open the Markdown note that contains local image references.
2. Run `Sync images to r2` from the command palette, or click the ribbon icon.
3. Wait for the result notice.

Example result:

```text
Image sync: 3 uploaded, 1 skipped, 0 failed, 3 trashed, 0 trash failed.
```

Only successfully uploaded images are replaced. Uploaded local image files are moved to Obsidian trash after the note is updated; they are not permanently deleted. If moving a file to trash fails, the result notice reports it and the uploaded file remains in the vault.

When the same local image is referenced multiple times in one note, it is uploaded once and all matching references are replaced. Wiki embeds are converted to Markdown image links, for example `![[image.png|alias]]` becomes `![](https://...)`.

### Upload cover image (to frontmatter)

1. Open the Markdown note whose YAML frontmatter should receive the cover URL (by default a line `cover:`, or whatever you set under **Cover frontmatter property**).
2. Run **Upload cover image** from the command palette.
3. Choose a supported image file. The plugin uploads it to R2 using **Cover object key template** (or **Object key template** when the cover template is empty), optionally converting raster formats to WebP per **Convert cover images to webp**, then sets that property in the active file’s frontmatter to the public URL.

### Delete uploaded images

1. Open the Markdown note that contains R2 image links created by this plugin (and/or a frontmatter URL under your **Cover frontmatter property** pointing at R2).
2. Run `Delete r2 images` from the command palette.
3. Preview the detected images, select the images to delete, then click `Delete selected`.
4. Wait for the result notice.

The plugin lists every reference whose URL starts with the configured **Public base URL**:

- Markdown image links: `![](https://…)` (and angle-bracket targets).
- YAML **frontmatter** in the leading `---` block: a single line `key:` matching **Cover frontmatter property** (default `cover:`) whose value is that public URL (plain, double-quoted, or single-quoted).

Successfully deleted objects are removed from the note: Markdown links are stripped, and a deleted cover removes the entire matching frontmatter line. If deleting an object in R2 fails, the corresponding note text is left unchanged.

## Upload paths

Article body images and cover images both use the same placeholder rules, but you can choose **different templates** so covers live under their own prefix (for example `cover/…`).

### Article body images (`Object key template`)

Used when you run **Sync images to r2**, and when **Auto-upload on drop** handles drops into the editor. Placeholders are expanded with the upload time in **local time**: `{year}`, `{month}`, `{day}`, `{hour}`, `{minute}`, `{second}`, `{timestamp}` (compact `YYYYMMDDHHmmss`), and `{filename}` (normalized: lowercase, safe characters).

The default template matches the original layout:

```text
{year}/{month}/{timestamp}-{filename}
```

For example, running the sync on April 26, 2026 at 14:30:22 for `My Screenshot 01.png` creates a key like this when **Convert article images to webp** is on:

```text
2026/04/20260426143022-my-screenshot-01.webp
```

With **Convert article images to webp** off, the same sync would use the original extension (for example `.png`) in `{filename}`.

### Cover images (`Cover object key template`)

Used when you run **Upload cover image**. If you leave this field empty, the plugin uses the same template as **Object key template**.

Example: keep the default for article images but put covers under a `cover` folder:

| Setting | Example value |
| --- | --- |
| Object key template | `{year}/{month}/{timestamp}-{filename}` |
| Cover object key template | `cover/{year}/{month}/{timestamp}-{filename}` |

With **Convert cover images to webp** on, uploading `hero.png` on April 26, 2026 at 14:30:22 creates a key like:

```text
cover/2026/04/20260426143022-hero.webp
```

With **Convert cover images to webp** off, the same upload keeps the original extension (for example `.png`) in `{filename}`.

Front slash at the start of a template is optional; leading slashes are normalized away.

Releases that only had **Object key prefix** migrate once: `blog` becomes  
`blog/{year}/{month}/{timestamp}-{filename}`.

File names are normalized to lowercase letters, numbers, hyphens, underscores, and dots (see `{filename}` above).

## Skipped and failed files

- Image URLs that already start with `http://` or `https://` are skipped.
- Missing local files are skipped.
- Unsupported file types are ignored.
- If **Convert article images to webp** is on and WebP conversion fails for a note image, that reference fails and its link is left unchanged.
- If **Convert cover images to webp** is on and WebP conversion fails for a cover upload, the upload is cancelled and frontmatter is not updated.
- Unsupported cover file types are rejected with a notice.
- If an object with the same key already exists in R2, that image fails, an additional notice shows the existing object key, and its link is left unchanged.
- If an upload fails, only that image is left unchanged.
- **Auto-upload on drop:** A duplicate key or other upload error triggers a **local fallback** (attachment + local link) instead of leaving the note empty; manual **Sync images to r2** still leaves the link unchanged when the object already exists, as above.

Turn on **Detailed error notices** under **Error reporting** when you need clearer failure reasons (credentials, wrong bucket, timeouts, and so on). The summary line still shows counts such as `failed`; details appear in follow-up notices while the option is enabled.

## Development

### Build

Requires [pnpm](https://pnpm.io). From the repository root:

```bash
pnpm install
pnpm check    # TypeScript, ESLint, production bundle
```

`pnpm build` runs typecheck and esbuild; `pnpm dev` runs the esbuild watcher (see `esbuild.config.mjs`).

### Source layout

The TypeScript under `src/` is grouped by responsibility (plugin entry stays at `main.ts`):

| Area | Files |
| --- | --- |
| R2 connection | `pluginR2.ts` (secrets and client from plugin settings), `r2.ts` (S3 client wrapper) |
| URLs and keys | `publicR2Url.ts`, `objectKeyTemplate.ts` (templates, settings migration) |
| Images | `imagePaths.ts`, `imageContentType.ts`, `convert.ts`, `droppedImageFiles.ts` |
| Markdown / vault | `noteBodyImageRefs.ts` (local embeds for sync), `noteMarkdownR2PublicLinks.ts` (public URL embeds and configurable frontmatter cover property for delete) |
| Features | `syncActiveNoteImages.ts`, `editorDropUpload.ts`, `cover.ts`, `deleteActiveNoteR2Images.ts` |
| Errors | `r2ErrorInsight.ts` |
| Settings | `settings.ts`, `ui/SettingsTab.ts` |
| UI | `ui/R2ImageDeleteModal.ts`, `ui/coverImagePicker.ts` |
| Commands | `commands/index.ts` |

## License

MIT
