import { App, PluginSettingTab, Setting } from "obsidian";
import TimeTrackerPlusPlugin from "./main";
import { DEFAULT_SETTINGS } from "./settings";

export class TimeTrackerPlusSettingsTab extends PluginSettingTab {
	plugin: TimeTrackerPlusPlugin;

	constructor(app: App, plugin: TimeTrackerPlusPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName("Time Tracker Plus settings")
			.setHeading();

		new Setting(this.containerEl)
			.setName("Timestamp display format")
			.setDesc(
				createFragment((f) => {
					f.createSpan({ text: "The way that timestamps in time tracker tables should be displayed. Uses " });
					f.createEl("a", {
						text: "moment.js",
						href: "https://momentjs.com/docs/#/parsing/string-format/"
					});
					f.createSpan({ text: " syntax." });
				})
			)
			.addText((t) => {
				t.setValue(String(this.plugin.settings.timestampFormat));
				t.onChange(async (v) => {
					this.plugin.settings.timestampFormat = v.length ? v : DEFAULT_SETTINGS.timestampFormat;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("CSV delimiter")
			.setDesc(
				"The delimiter character that should be used when copying a tracker table as CSV. For example, some languages use a semicolon instead of a comma."
			)
			.addText((t) => {
				t.setValue(String(this.plugin.settings.csvDelimiter));
				t.onChange(async (v) => {
					this.plugin.settings.csvDelimiter = v.length ? v : DEFAULT_SETTINGS.csvDelimiter;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Fine-grained durations")
			.setDesc(
				"Whether durations should include days, months and years. If this is disabled, additional time units will be displayed as part of the hours."
			)
			.addToggle((t) => {
				t.setValue(this.plugin.settings.fineGrainedDurations);
				t.onChange(async (v) => {
					this.plugin.settings.fineGrainedDurations = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Timestamp durations")
			.setDesc(
				"Whether durations should be displayed in a timestamp format (12:15:01) rather than the default duration format (12h 15m 1s)."
			)
			.addToggle((t) => {
				t.setValue(this.plugin.settings.timestampDurations);
				t.onChange(async (v) => {
					this.plugin.settings.timestampDurations = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Display segments in reverse order")
			.setDesc(
				"Whether older tracker segments should be displayed towards the bottom of the tracker, rather than the top."
			)
			.addToggle((t) => {
				t.setValue(this.plugin.settings.reverseSegmentOrder);
				t.onChange(async (v) => {
					this.plugin.settings.reverseSegmentOrder = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Auto-stop times")
			.setDesc(
				"Automatically stop all running timers at specific times each day. Enter times in HH:mm format separated by semicolons (e.g., 11:30;17:30). Leave empty to disable."
			)
			.addText((t) => {
				t.setPlaceholder("11:30;17:30");
				t.setValue(String(this.plugin.settings.autoStopTimes));
				t.onChange(async (v) => {
					this.plugin.settings.autoStopTimes = v;
					await this.plugin.saveSettings();
				});
			});

		// Support section
		this.containerEl.createEl("hr");
		this.containerEl.createEl("p", {
			text: "If you like this plugin and want to support its development, you can buy me a coffee!"
		});

		const bmcContainer = this.containerEl.createDiv({ cls: "time-tracker-plus-bmc-container" });
		const bmcButton = bmcContainer.createEl("a", {
			href: "https://buymeacoffee.com/hudsonventura",
			attr: { target: "_blank" },
			cls: "time-tracker-plus-bmc-button"
		});
		bmcButton.createSpan({ text: "☕", cls: "time-tracker-plus-bmc-icon" });
		bmcButton.createSpan({ text: " Buy me a coffee", cls: "time-tracker-plus-bmc-text" });
	}
}

