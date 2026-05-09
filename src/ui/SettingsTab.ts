import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type CloudflareR2SyncPlugin from "../../main";
import { normalizeR2CachePreset, type R2CachePreset } from "../r2";
import { DEFAULT_OBJECT_KEY_TEMPLATE } from "../settings";
import { buildObjectKeyFromTemplate, buildPublicUrl } from "../sync";

/** Fixed date for the template example line (15 Apr 2026, 14:30:22 local). */
const OBJECT_KEY_EXAMPLE_DATE = new Date(2026, 3, 15, 14, 30, 22);
const OBJECT_KEY_EXAMPLE_FILENAME = "example.png";

const R2_CACHE_PRESET_DROPDOWN: { preset: R2CachePreset; label: string }[] = [
	{ preset: "yearImmutable", label: "1 year, immutable" },
	{ preset: "year", label: "1 year (no immutable directive)" },
	{ preset: "day", label: "24 hours" },
	{ preset: "hour", label: "1 hour" },
	{ preset: "revalidate", label: "Always revalidate (max-age 0)" },
];

export class CloudflareR2SyncSettingTab extends PluginSettingTab {
	plugin: CloudflareR2SyncPlugin;

	constructor(app: App, plugin: CloudflareR2SyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		let refreshObjectKeyExample: () => void = () => {};

		new Setting(containerEl)
			.setName("R2 connection")
			.setHeading();

		new Setting(containerEl)
			.setName("Account ID")
			.setDesc("Cloudflare account ID used to build the r2 S3 endpoint.")
			.addText((text) => {
				text
					.setPlaceholder("Account ID")
					.setValue(this.plugin.settings.accountId)
					.onChange(async (value) => {
						this.plugin.settings.accountId = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Bucket name")
			.setDesc("R2 bucket that receives uploaded images.")
			.addText((text) => {
				text
					.setPlaceholder("Bucket name")
					.setValue(this.plugin.settings.bucketName)
					.onChange(async (value) => {
						this.plugin.settings.bucketName = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Public base URL")
			.setDesc("Base URL used when replacing local image links.")
			.addText((text) => {
				text
					.setPlaceholder("https://example.com")
					.setValue(this.plugin.settings.publicBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.publicBaseUrl = value.trim();
						await this.plugin.saveSettings();
						refreshObjectKeyExample();
					});
			});

		const objectKeySetting = new Setting(containerEl)
			.setName("Object key template")
			.setDesc(
				"Path relative to the bucket for each object. Use placeholders {year}, {month}, {day}, {hour}, {minute}, {second}, {timestamp} (compact local upload time), and {filename} (sanitized)."
			);

		const objectKeyExampleLine = objectKeySetting.descEl.createDiv({
			cls: "setting-item-description",
		});

		refreshObjectKeyExample = (): void => {
			const samplePath = buildObjectKeyFromTemplate(
				OBJECT_KEY_EXAMPLE_FILENAME,
				OBJECT_KEY_EXAMPLE_DATE,
				String(this.plugin.settings.objectKeyTemplate ?? "")
			);
			const baseUrl = this.plugin.settings.publicBaseUrl.trim();
			const exampleTarget =
				baseUrl === "" ? samplePath : buildPublicUrl(baseUrl, samplePath);
			objectKeyExampleLine.setText(`Example: ${exampleTarget}`);
		};

		objectKeySetting.addText((text) => {
			text
				.setPlaceholder(DEFAULT_OBJECT_KEY_TEMPLATE)
				.setValue(
					String(this.plugin.settings.objectKeyTemplate ?? "")
				)
				.onChange(async (value) => {
					this.plugin.settings.objectKeyTemplate = String(value);
					await this.plugin.saveSettings();
					refreshObjectKeyExample();
				});
		});

		refreshObjectKeyExample();

		new Setting(containerEl)
			.setName("Upload cache control")
			.setDesc(
				"Object cache-control metadata for uploads to r2 and browsers. Cloudflare cache rules may still override at the edge."
			)
			.addDropdown((dropdown) => {
				for (const { preset, label } of R2_CACHE_PRESET_DROPDOWN) {
					dropdown.addOption(preset, label);
				}

				const current = normalizeR2CachePreset(
					String(this.plugin.settings.r2UploadCachePreset)
				);
				this.plugin.settings.r2UploadCachePreset = current;
				dropdown.setValue(current).onChange(async (value) => {
					this.plugin.settings.r2UploadCachePreset = normalizeR2CachePreset(value);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Access key ID secret")
			.setDesc("Select the secret that contains the r2 access key ID.")
			.addComponent((element) =>
				new SecretComponent(this.app, element)
					.setValue(this.plugin.settings.accessKeyIdSecretName)
					.onChange(async (value) => {
						this.plugin.settings.accessKeyIdSecretName = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Secret access key secret")
			.setDesc("Select the secret that contains the r2 secret access key.")
			.addComponent((element) =>
				new SecretComponent(this.app, element)
					.setValue(this.plugin.settings.secretAccessKeySecretName)
					.onChange(async (value) => {
						this.plugin.settings.secretAccessKeySecretName = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Error reporting")
			.setHeading();

		new Setting(containerEl)
			.setName("Detailed error notices")
			.setDesc(
				"When r2 requests fail, show category, HTTP status, and short hints in notices (useful screenshots for support)."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.notifyDetailedErrors)
					.onChange(async (value) => {
						this.plugin.settings.notifyDetailedErrors = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Image conversion")
			.setHeading();

		new Setting(containerEl)
			.setName("Webp quality (article images)")
			.setDesc("Quality used when converting PNG, JPEG, or bmp references to webp (0 to 1). Cover uploads stay PNG.")
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 1, 0.05)
					.setValue(this.plugin.settings.webpQuality)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.webpQuality = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
