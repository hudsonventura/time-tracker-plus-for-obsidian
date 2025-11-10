import { Modal, App, Setting, TextComponent } from "obsidian";

export class ConfirmModal extends Modal {
	private message: string;
	private callback: (result: boolean) => void;
	private picked = false;

	constructor(app: App, message: string, callback: (result: boolean) => void) {
		super(app);
		this.message = message;
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl("p", { text: this.message });

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Ok")
					.setCta()
					.onClick(() => {
						this.picked = true;
						this.close();
						this.callback(true);
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => {
						this.picked = true;
						this.close();
						this.callback(false);
					})
			);
	}

	onClose(): void {
		if (!this.picked) {
			this.callback(false);
		}
	}
}

export class TargetTimeModal extends Modal {
	private callback: (result: string | null) => void;
	private picked = false;

	constructor(app: App, callback: (result: string | null) => void) {
		super(app);
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl("h3", { text: "Set target time" });
		contentEl.createEl("p", { text: "Enter target time (e.g., 2h, 30m, 1h30m, 2d5h):" });

		let textInput: TextComponent;

		new Setting(contentEl)
			.setName("Target time")
			.addText((text) => {
				textInput = text;
				text.setPlaceholder("2h");
				text.inputEl.focus();
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						this.picked = true;
						this.close();
						this.callback(text.getValue());
					}
				});
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Ok")
					.setCta()
					.onClick(() => {
						this.picked = true;
						this.close();
						this.callback(textInput.getValue());
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => {
						this.picked = true;
						this.close();
						this.callback(null);
					})
			);
	}

	onClose(): void {
		if (!this.picked) {
			this.callback(null);
		}
	}
}

