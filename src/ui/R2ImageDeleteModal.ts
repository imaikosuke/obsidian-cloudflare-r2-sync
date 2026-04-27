import { App, Modal } from "obsidian";

export interface R2ImageDeletionCandidate {
	objectKey: string;
	referenceCount: number;
	url: string;
}

export function openR2ImageDeleteModal(
	app: App,
	candidates: R2ImageDeletionCandidate[]
): Promise<R2ImageDeletionCandidate[] | null> {
	return new Promise((resolve) => {
		new R2ImageDeleteModal(app, candidates, resolve).open();
	});
}

class R2ImageDeleteModal extends Modal {
	private readonly candidates: R2ImageDeletionCandidate[];
	private readonly resolveSelection: (
		candidates: R2ImageDeletionCandidate[] | null
	) => void;
	private readonly selectedObjectKeys = new Set<string>();
	private resolved = false;

	constructor(
		app: App,
		candidates: R2ImageDeletionCandidate[],
		resolveSelection: (candidates: R2ImageDeletionCandidate[] | null) => void
	) {
		super(app);
		this.candidates = candidates;
		this.resolveSelection = resolveSelection;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("cloudflare-r2-sync-delete-modal");

		contentEl.createEl("h2", { text: "Delete r2 images" });
		contentEl.createEl("p", {
			cls: "cloudflare-r2-sync-delete-description",
			text: "Select the uploaded images to delete from cloudflare r2. Successfully deleted image links will be removed from the active note.",
		});

		const listEl = contentEl.createDiv({
			cls: "cloudflare-r2-sync-delete-list",
		});
		const checkboxes: HTMLInputElement[] = [];

		for (const candidate of this.candidates) {
			const itemEl = listEl.createDiv({
				cls: "cloudflare-r2-sync-delete-item",
			});
			const checkbox = itemEl.createEl("input", {
				attr: {
					"aria-label": `Select ${candidate.objectKey}`,
					type: "checkbox",
				},
			});
			checkboxes.push(checkbox);

			itemEl.createEl("img", {
				attr: {
					alt: "",
					loading: "lazy",
					src: candidate.url,
				},
				cls: "cloudflare-r2-sync-delete-preview",
			});

			const detailsEl = itemEl.createDiv({
				cls: "cloudflare-r2-sync-delete-details",
			});
			detailsEl.createDiv({
				cls: "cloudflare-r2-sync-delete-key",
				text: candidate.objectKey,
			});
			detailsEl.createDiv({
				cls: "cloudflare-r2-sync-delete-url",
				text: candidate.url,
			});
			detailsEl.createDiv({
				cls: "cloudflare-r2-sync-delete-count",
				text: `${candidate.referenceCount} reference${
					candidate.referenceCount === 1 ? "" : "s"
				}`,
			});

			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					this.selectedObjectKeys.add(candidate.objectKey);
				} else {
					this.selectedObjectKeys.delete(candidate.objectKey);
				}
				updateDeleteButton();
			});
		}

		const actionsEl = contentEl.createDiv({
			cls: "cloudflare-r2-sync-delete-actions",
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
		const deleteButton = actionsEl.createEl("button", {
			cls: "mod-warning",
			text: "Delete selected",
		});
		deleteButton.disabled = true;

		const updateDeleteButton = (): void => {
			deleteButton.disabled = this.selectedObjectKeys.size === 0;
		};

		selectAllButton.addEventListener("click", () => {
			this.selectedObjectKeys.clear();
			for (const candidate of this.candidates) {
				this.selectedObjectKeys.add(candidate.objectKey);
			}
			for (const checkbox of checkboxes) {
				checkbox.checked = true;
			}
			updateDeleteButton();
		});

		clearButton.addEventListener("click", () => {
			this.selectedObjectKeys.clear();
			for (const checkbox of checkboxes) {
				checkbox.checked = false;
			}
			updateDeleteButton();
		});

		cancelButton.addEventListener("click", () => {
			this.resolve(null);
			this.close();
		});

		deleteButton.addEventListener("click", () => {
			const selected = this.candidates.filter((candidate) =>
				this.selectedObjectKeys.has(candidate.objectKey)
			);
			this.resolve(selected);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolve(null);
		}
	}

	private resolve(candidates: R2ImageDeletionCandidate[] | null): void {
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		this.resolveSelection(candidates);
	}
}
