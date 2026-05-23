import { App, Modal } from "obsidian";

export interface R2ImageSyncPreviewCandidate {
	id: string;
	sourceLabel: string;
	previewUrl: string;
	objectKey: string;
	publicUrl: string;
	referenceCount?: number;
}

export interface R2ImageSyncPreviewModalOptions {
	description?: string;
	title?: string;
}

export function openR2ImageSyncPreviewModal(
	app: App,
	candidates: R2ImageSyncPreviewCandidate[],
	options?: R2ImageSyncPreviewModalOptions
): Promise<R2ImageSyncPreviewCandidate[] | null> {
	return new Promise((resolve) => {
		new R2ImageSyncPreviewModal(app, candidates, resolve, options).open();
	});
}

class R2ImageSyncPreviewModal extends Modal {
	private readonly candidates: R2ImageSyncPreviewCandidate[];
	private readonly options: R2ImageSyncPreviewModalOptions;
	private readonly resolveSelection: (
		candidates: R2ImageSyncPreviewCandidate[] | null
	) => void;
	private readonly selectedIds = new Set<string>();
	private readonly blobPreviewUrls: string[] = [];
	private resolved = false;

	constructor(
		app: App,
		candidates: R2ImageSyncPreviewCandidate[],
		resolveSelection: (
			candidates: R2ImageSyncPreviewCandidate[] | null
		) => void,
		options?: R2ImageSyncPreviewModalOptions
	) {
		super(app);
		this.candidates = candidates;
		this.resolveSelection = resolveSelection;
		this.options = options ?? {};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("cloudflare-r2-sync-preview-modal");

		contentEl.createEl("h2", {
			text: this.options.title ?? "Sync preview",
		});
		contentEl.createEl("p", {
			cls: "cloudflare-r2-sync-preview-description",
			text:
				this.options.description ??
				"Select the images to upload to cloudflare r2. Review object keys and public urls before uploading.",
		});

		const listEl = contentEl.createDiv({
			cls: "cloudflare-r2-sync-preview-list",
		});
		const checkboxes: HTMLInputElement[] = [];

		for (const candidate of this.candidates) {
			if (candidate.previewUrl.startsWith("blob:")) {
				this.blobPreviewUrls.push(candidate.previewUrl);
			}

			const itemEl = listEl.createDiv({
				cls: "cloudflare-r2-sync-preview-item",
			});
			const checkbox = itemEl.createEl("input", {
				attr: {
					"aria-label": `Select ${candidate.sourceLabel}`,
					type: "checkbox",
				},
			});
			checkbox.checked = true;
			this.selectedIds.add(candidate.id);
			checkboxes.push(checkbox);

			itemEl.createEl("img", {
				attr: {
					alt: "",
					loading: "lazy",
					src: candidate.previewUrl,
				},
				cls: "cloudflare-r2-sync-preview-image",
			});

			const detailsEl = itemEl.createDiv({
				cls: "cloudflare-r2-sync-preview-details",
			});
			detailsEl.createDiv({
				cls: "cloudflare-r2-sync-preview-source",
				text: candidate.sourceLabel,
			});
			detailsEl.createDiv({
				cls: "cloudflare-r2-sync-preview-key",
				text: candidate.objectKey,
			});
			detailsEl.createDiv({
				cls: "cloudflare-r2-sync-preview-url",
				text: candidate.publicUrl,
			});
			if (candidate.referenceCount !== undefined) {
				detailsEl.createDiv({
					cls: "cloudflare-r2-sync-preview-count",
					text: `${candidate.referenceCount} reference${
						candidate.referenceCount === 1 ? "" : "s"
					}`,
				});
			}

			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					this.selectedIds.add(candidate.id);
				} else {
					this.selectedIds.delete(candidate.id);
				}
				updateUploadButton();
			});
		}

		const actionsEl = contentEl.createDiv({
			cls: "cloudflare-r2-sync-preview-actions",
		});
		const selectAllButton = actionsEl.createEl("button", {
			text: "Select all",
		});
		const clearButton = actionsEl.createEl("button", {
			text: "Clear",
		});
		const cancelButton = actionsEl.createEl("button", {
			text: "Cancel",
		});
		const uploadButton = actionsEl.createEl("button", {
			cls: "mod-cta",
			text: "Upload selected",
		});
		uploadButton.disabled = this.selectedIds.size === 0;

		const updateUploadButton = (): void => {
			uploadButton.disabled = this.selectedIds.size === 0;
		};

		selectAllButton.addEventListener("click", () => {
			this.selectedIds.clear();
			for (const candidate of this.candidates) {
				this.selectedIds.add(candidate.id);
			}
			for (const checkbox of checkboxes) {
				checkbox.checked = true;
			}
			updateUploadButton();
		});

		clearButton.addEventListener("click", () => {
			this.selectedIds.clear();
			for (const checkbox of checkboxes) {
				checkbox.checked = false;
			}
			updateUploadButton();
		});

		cancelButton.addEventListener("click", () => {
			this.resolve(null);
			this.close();
		});

		uploadButton.addEventListener("click", () => {
			const selected = this.candidates.filter((candidate) =>
				this.selectedIds.has(candidate.id)
			);
			this.resolve(selected);
			this.close();
		});
	}

	onClose(): void {
		for (const previewUrl of this.blobPreviewUrls) {
			URL.revokeObjectURL(previewUrl);
		}
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolve(null);
		}
	}

	private resolve(candidates: R2ImageSyncPreviewCandidate[] | null): void {
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		this.resolveSelection(candidates);
	}
}
