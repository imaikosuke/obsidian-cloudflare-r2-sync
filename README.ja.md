# Cloudflare R2 Sync

ノートのローカル画像を Cloudflare R2 にアップロードし、リンクを公開 URL に置き換えます。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.2-blue.svg)](https://github.com/imaikosuke/obsidian-cloudflare-r2-sync/releases)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7c3aed.svg)](https://obsidian.md)

> [English ver](README.md)

## 概要

Cloudflare R2 Sync は、Vault 内のローカル画像を Cloudflare R2 に移行するプラグインです。同期を実行すると、アクティブなノート内のローカル画像参照を検出し、R2 にアップロードしてリンクを公開 URL に置き換え、ローカルファイルを Obsidian のゴミ箱に移動します。

主な機能:

- **Sync images to R2** — アクティブなノートに含まれるすべてのローカル画像を一括アップロード。
- **Auto-upload on drop** — エディターに画像をドラッグ＆ドロップすると即時アップロード。
- **Upload cover image** — 画像を選択し、公開 URL を YAML フロントマターに書き込み。
- **Delete R2 images** — 選択した R2 オブジェクトを削除し、ノート内の参照を除去。
- **WebP 変換** — `png`、`jpeg`、`jpg`、`bmp` をアップロード前に WebP へ再エンコード（オプション）。

認識する画像参照形式:

- `![alt](path/to/image.png)`
- `![alt](<path/to/image.png>)`
- `![[path/to/image.png]]`
- `![[path/to/image.png|alias]]`

`http://` または `https://` から始まるリモート URL は自動的にスキップされます。

## 目次

1. [クイックスタート](#クイックスタート)
2. [必要環境](#必要環境)
3. [Cloudflare の設定](#cloudflare-の設定)
4. [Obsidian への認証情報の保存](#obsidian-への認証情報の保存)
5. [プラグイン設定](#プラグイン設定)
6. [使い方](#使い方)
7. [アップロードパス](#アップロードパス)
8. [トラブルシューティング](#トラブルシューティング)
9. [開発](#開発)

## クイックスタート

1. 公開 URL を設定した **R2 バケットを作成する** — [詳細](#バケットの作成)
2. Obsidian がアップロードできるように **バケットに CORS を設定する** — [詳細](#cors-の設定)
3. **R2 API アクセスキー**（S3 互換）を作成する — [詳細](#r2-api-アクセスキーの作成)
4. **キーを Obsidian のシークレットとして保存する** — [詳細](#obsidian-への認証情報の保存)
5. アカウント ID、バケット名、公開 URL、シークレット名を **プラグインに設定する** — [詳細](#プラグイン設定)
6. ローカル画像を含むノートを開き、コマンドパレットから **Sync images to r2** を実行する。

## 必要環境

- Obsidian `1.11.4` 以上（デスクトップ版のみ）
- Cloudflare アカウント（R2 有効化済み）
- 公開 URL が設定された R2 バケット
- 書き込み・削除権限を持つ R2 S3 互換アクセスキーペア

## Cloudflare の設定

### バケットの作成

1. Cloudflare ダッシュボードを開き、**R2** → **Create bucket** を選択。
2. バケット名（例: `obsidian`）を設定。Location は **Automatic**、Storage class は **Standard** のままで OK。
3. 作成後、バケットの **Settings** タブを開いて公開 URL（R2 カスタムドメインまたはパブリックバケット URL）を設定する。
4. 公開 URL を控えておく — プラグインの **Public base URL** に入力します。

### R2 API アクセスキーの作成

プラグインは Cloudflare API トークンではなく、S3 互換の認証情報を使用します。

1. ダッシュボード → **R2** → **Manage R2 API Tokens** を開く。
2. **Access keys** → **Create access key** を選択。
3. バケット内のオブジェクトへの**書き込みと削除**権限を付与する。
4. **Access Key ID** と **Secret Access Key** をすぐにコピーする — シークレットは一度しか表示されません。

**アカウント ID の場所:** ダッシュボード → **R2** の概要ページ、または **Workers & Pages** → **Overview**。32 文字の 16 進数文字列です。詳細は [アカウント ID とゾーン ID の確認](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)（英語）を参照。

### CORS の設定

プラグインは Obsidian デスクトップ（オリジン `app://obsidian.md`）から R2 S3 API に直接 `PUT`・`DELETE` リクエストを送信します。CORS ポリシーが未設定だとバケット側でリクエストが拒否され、すべてのアップロード・削除が失敗します。

1. ダッシュボード → **R2** → 対象バケット → **Settings** → **CORS policy** を開く。
2. 以下の JSON を貼り付けて保存する。

```json
[
  {
    "AllowedOrigins": ["app://obsidian.md"],
    "AllowedMethods": ["PUT", "DELETE"],
    "AllowedHeaders": ["*"]
  }
]
```

### 収集する値

次の手順に進む前に、以下の 5 つの値を手元に用意してください。

| 値 | 場所 |
| --- | --- |
| Account ID | R2 の概要ページ または Workers & Pages の概要 |
| Bucket name | 作成時に決めた名前 |
| Public base URL | バケット Settings の公開 URL |
| Access Key ID | アクセスキー作成時にコピー |
| Secret Access Key | アクセスキー作成時にコピー |

## Obsidian への認証情報の保存

プラグインは生のシークレット値を設定に保存しません。代わりに Obsidian の組み込みシークレットストレージから読み取ります。プラグインを設定する前に 2 つのシークレットを作成してください。

1. **Obsidian 設定** を開き、シークレットストレージまたはキーチェーンのセクションを探す。
2. R2 の Access Key ID 用シークレットを作成する（例: `r2-access-key-id`）。
3. R2 の Secret Access Key 用シークレットを作成する（例: `r2-secret-access-key`）。

これらの名前をプラグイン設定で選択します。プラグインはシークレットの値自体には触れません。

## プラグイン設定

**設定** → **コミュニティプラグイン** → **Cloudflare R2 Sync** を開いてください。

### R2 connection（R2 接続）

| 設定 | 説明 |
| --- | --- |
| **Account ID** | Cloudflare の 32 文字アカウント ID。 |
| **Bucket name** | アップロード先の R2 バケット名。 |
| **Public base URL** | 置き換え後のリンクで使う URL プレフィックス（例: `https://images.example.com`）。 |
| **Object key template** | 本文画像の R2 オブジェクトパスパターン（[アップロードパス](#アップロードパス)参照）。デフォルト: `{year}/{month}/{timestamp}-{filename}`。 |
| **Cover object key template** | カバー画像専用のパスパターン（オプション）。空欄の場合は本文テンプレートを使用。 |
| **Cover frontmatter property** | **Upload cover image** が公開 URL を書き込む YAML キー。デフォルト: `cover`。 |
| **Upload cache control** | アップロード時に設定する `Cache-Control` メタデータ。デフォルト: 1 年・immutable。 |
| **Access key ID secret** | R2 アクセスキー ID を格納した Obsidian シークレットの名前。 |
| **Secret access key secret** | R2 シークレットアクセスキーを格納した Obsidian シークレットの名前。 |

### Automation（自動化）

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| **Auto-upload on drop** | オン | エディターに画像をドロップしたとき自動で R2 にアップロード。手動のみにしたい場合はオフ。 |
| **Sync preview before upload** | オフ | アップロード前にプレビューモーダルを表示し、オブジェクトキーと URL を確認してからアップロードする画像を選択できる。 |

### Image conversion（画像変換）

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| **Convert article images to webp** | オン | 本文画像の同期・ドロップ時に `png`、`jpeg`、`jpg`、`bmp` を WebP に再エンコード。オフ時はオリジナル形式でアップロード。 |
| **Webp quality (article images)** | 0.8 | 変換時のクオリティ（0.5〜1）。変換がオンのときのみ表示。 |
| **Convert cover images to webp** | オフ | カバー画像アップロード時にラスター形式を WebP に再エンコード。 |
| **Webp quality (cover images)** | 0.8 | 変換時のクオリティ（0.5〜1）。変換がオンのときのみ表示。 |

### Error reporting（エラーレポート）

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| **Detailed error notices** | オフ | R2 リクエスト失敗時にエラーカテゴリ・HTTP ステータス・ヒントを追加通知として表示。サポート用スクリーンショットに便利。 |

## 使い方

### エディターへのドラッグ＆ドロップ

1. Markdown ノートを開き、エディターにフォーカスする。
2. ファイルマネージャーから画像をエディターにドラッグする。
3. **Auto-upload on drop** がオンの場合、画像が R2 にアップロードされ、ドロップした位置に `![](…)` リンクが挿入される。
4. **Sync preview before upload** がオンの場合、先にプレビューモーダルが開き、アップロードする画像を選択できる。
5. アップロードに失敗した場合、ファイルは通常の添付ファイルとして保存され、ローカル埋め込みリンクが挿入される。

### ノート内の画像を同期する

1. ローカル画像参照を含む Markdown ノートを開く。
2. コマンドパレットから **Sync images to r2** を実行するか、リボンアイコンをクリックする。
3. **Sync preview before upload** がオンの場合、プレビューモーダルで検出された画像を確認し、**Upload selected** をクリックする。
4. 結果の通知を待つ。

結果通知の例:

```
Image sync: 3 uploaded, 1 skipped, 0 failed, 3 trashed, 0 trash failed.
```

アップロードに成功した画像のみ、ローカルリンクが R2 の公開 URL に置き換えられます。元のローカルファイルは Obsidian のゴミ箱に移動されます（完全削除ではありません）。ノート内に同じ画像への参照が複数ある場合、アップロードは 1 回だけ行われ、すべての参照が置き換えられます。Wiki 埋め込みは Markdown リンクに変換されます（例: `![[image.png|alias]]` → `![alias](https://…)`）。

### カバー画像をアップロードする

1. フロントマターにカバー URL を追加したいノートを開く。
2. コマンドパレットから **Upload cover image** を実行する。
3. サポートされている画像ファイル（`png`、`jpeg`、`jpg`、`bmp`、`gif`、`ico`、`webp`、`svg`）を選択する。
4. **Sync preview before upload** がオンの場合、プレビューモーダルで確認する。
5. **Cover object key template**（カバーテンプレートが空の場合は本文テンプレート）を使って R2 にアップロードし、**Cover frontmatter property** に設定した YAML キーに公開 URL を書き込む。

### アップロード済み画像を削除する

1. プラグインで作成した R2 画像リンク（またはフロントマターのカバー URL）を含むノートを開く。
2. コマンドパレットから **Delete r2 images** を実行する。
3. プレビューモーダルで検出された画像を確認し、削除するものを選んで **Delete selected** をクリックする。
4. 削除に成功したオブジェクトは R2 から削除され、対応する Markdown リンクがノートから除去される。削除されたカバー URL はフロントマターの該当行ごと削除される。

削除コマンドは **Public base URL** で始まる URL を持つ以下の参照を検出します:

- Markdown 画像リンク: `![alt](https://…)` および山括弧バリアント
- **Cover frontmatter property** に一致するキーを持つフロントマター行

## アップロードパス

本文画像とカバー画像は同じプレースホルダールールを使いますが、それぞれ別のテンプレートを設定できます。

### プレースホルダー一覧

| グループ | プレースホルダー |
| --- | --- |
| 日時 | `{year}`, `{month}`, `{day}`, `{hour}`, `{minute}`, `{second}`, `{timestamp}` |
| ファイル | `{filename}` |
| ノート | `{slug}`, `{notepath}` |
| アップロード | `{hash}`, `{uuid}` |

- `{timestamp}` — ローカル時刻のコンパクト形式: `YYYYMMDDHHmmss`。
- `{filename}` — 元のファイル名を小文字・安全な文字に正規化したもの。変換オン時は拡張子が `.webp` になる。
- `{slug}` — アクティブなノートのファイル名（拡張子なし）を正規化したもの（例: `My Post.md` → `my-post`）。
- `{notepath}` — Vault 相対のノートパス（拡張子なし）。各セグメントを正規化（例: `blog/My Post.md` → `blog/my-post`）。
- `{hash}` — アップロードバイト列の SHA-256 ハッシュの先頭 12 文字（16 進数）。テンプレートに含む場合のみ計算。
- `{uuid}` — アップロードごとに生成される UUID v4（ハイフンなし）。テンプレートに含む場合のみ生成。

アクティブなノートが解決できない場合、`{slug}` と `{notepath}` は `untitled` にフォールバックします。

### 本文画像（`Object key template`）

デフォルト: `{year}/{month}/{timestamp}-{filename}`

例 — **Convert article images to webp** オンで 2026 年 4 月 15 日 14:30:22 に `My Screenshot.png` を同期:

```
2026/04/20260415143022-my-screenshot.webp
```

テンプレート `{slug}/{filename}` でノートが `blog/My Post.md` の場合:

```
my-post/20260415143022-my-screenshot.webp
```

### カバー画像（`Cover object key template`）

空欄にすると本文テンプレートを流用します。カバー専用のプレフィックスを付ける例:

| 設定 | 値 |
| --- | --- |
| Object key template | `{year}/{month}/{timestamp}-{filename}` |
| Cover object key template | `cover/{year}/{month}/{timestamp}-{filename}` |

**Convert cover images to webp** オンで 2026 年 4 月 15 日 14:30:22 に `hero.png` をアップロード:

```
cover/2026/04/20260415143022-hero.webp
```

テンプレート先頭のスラッシュは自動的に除去されます。

## 開発

### ビルド

このリポジトリは [mise](https://mise.jdx.dev) で Node.js のバージョン管理を行い（`mise.toml` で Node 24 を指定）、パッケージマネージャーには [pnpm](https://pnpm.io) を使用します（`package.json` で固定）。

```bash
# mise をインストールしていない場合はインストールし、Node をセットアップ:
mise install

# 依存関係のインストールと全チェックの実行:
pnpm install
pnpm check    # TypeScript, ESLint, 本番バンドル
```

`pnpm build` は型チェックと esbuild を実行します。`pnpm dev` は esbuild ウォッチャーを起動します。

### ソースレイアウト

| 領域 | ファイル |
| --- | --- |
| R2 接続 | `pluginR2.ts`, `r2.ts` |
| URL・キー | `publicR2Url.ts`, `objectKeyTemplate.ts` |
| 画像 | `imagePaths.ts`, `imageContentType.ts`, `convert.ts`, `droppedImageFiles.ts` |
| Markdown・Vault | `noteBodyImageRefs.ts`, `noteMarkdownR2PublicLinks.ts` |
| 機能 | `syncActiveNoteImages.ts`, `editorDropUpload.ts`, `cover.ts`, `deleteActiveNoteR2Images.ts` |
| エラー | `r2ErrorInsight.ts` |
| 設定 | `settings.ts`, `ui/SettingsTab.ts` |
| UI | `ui/R2ImageDeleteModal.ts`, `ui/coverImagePicker.ts` |
| コマンド | `commands/index.ts` |

## ライセンス

MIT
