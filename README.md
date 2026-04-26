# Cloudflare R2 Sync

Sync local note images to Cloudflare R2.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/imaikosuke/obsidian-cloudflare-r2-sync/releases)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7c3aed.svg)](https://obsidian.md)

## What it does

Cloudflare R2 Sync uploads local image files referenced from the active Markdown note to Cloudflare R2, replaces only the successfully uploaded image links with public URLs, then moves the uploaded local files to Obsidian trash.

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
- An R2 access key pair that can upload objects
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
4. Create R2 credentials with permission to upload objects to the bucket.
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
- Copy **Access Key ID** and **Secret Access Key** immediately; the secret is shown only once. Give the key permission to write objects to your bucket (or broader R2 permissions if you prefer).

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

Open `Settings` → `Community plugins` → `Cloudflare R2 Sync` and fill in:

- `Account ID`: Your Cloudflare account ID.
- `Bucket name`: The R2 bucket to upload images to.
- `Public base URL`: The URL prefix used in the replaced Markdown links, for example `https://images.example.com`.
- `Access key ID secret`: Select the Obsidian secret that contains the R2 access key ID.
- `Secret access key secret`: Select the Obsidian secret that contains the R2 secret access key.

## Usage

1. Open the Markdown note that contains local image references.
2. Run `Sync images to r2` from the command palette, or click the ribbon icon.
3. Wait for the result notice.

Example result:

```text
Image sync: 3 uploaded, 1 skipped, 0 failed, 3 trashed, 0 trash failed.
```

Only successfully uploaded images are replaced. Uploaded local image files are moved to Obsidian trash after the note is updated; they are not permanently deleted. If moving a file to trash fails, the result notice reports it and the uploaded file remains in the vault.

When the same local image is referenced multiple times in one note, it is uploaded once and all matching references are replaced. Wiki embeds are converted to Markdown image links, for example `![[image.png|alias]]` becomes `![](https://...)`.

## Upload paths

Uploaded objects use this key format:

```text
YYYY/MM/YYYYMMDD-normalized-file-name.ext
```

For example, running the sync on April 26, 2026 for `My Screenshot 01.png` creates a key like:

```text
2026/04/20260426-my-screenshot-01.png
```

File names are normalized to lowercase letters, numbers, hyphens, underscores, and dots.

## Skipped and failed files

- Image URLs that already start with `http://` or `https://` are skipped.
- Missing local files are skipped.
- Unsupported file types are ignored.
- If an object with the same key already exists in R2, that image fails, an additional notice shows the existing object key, and its link is left unchanged.
- If an upload fails, only that image is left unchanged.

## License

MIT
