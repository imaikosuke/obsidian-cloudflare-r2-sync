import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type CloudflareR2SyncPlugin from "../../main";

export class CloudflareR2SyncSettingTab extends PluginSettingTab {
	plugin: CloudflareR2SyncPlugin;

	constructor(app: App, plugin: CloudflareR2SyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

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
	}
}
