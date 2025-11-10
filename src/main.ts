import { Plugin, MarkdownRenderChild, TFile, Notice, moment } from "obsidian";
import { TimeTrackerPlusSettings, DEFAULT_SETTINGS } from "./settings";
import { TimeTrackerPlusSettingsTab } from "./settings-tab";
import { TargetTimeModal } from "./confirm-modal";
import {
	loadTracker,
	loadAllTrackers,
	displayTracker,
	getDuration,
	getTotalDuration,
	getDurationToday,
	getTotalDurationToday,
	getRunningEntry,
	isRunning,
	formatTimestamp,
	formatDuration,
	orderedEntries,
	stopAllRunnersInFile,
	Tracker,
	Entry
} from "./tracker";

export default class TimeTrackerPlusPlugin extends Plugin {
	settings: TimeTrackerPlusSettings;

	// Public API for DataviewJS and other plugins
	api = {
		loadTracker,
		loadAllTrackers: (fileName: string) => loadAllTrackers(fileName, this.app),
		getDuration,
		getTotalDuration,
		getDurationToday,
		getTotalDurationToday,
		getRunningEntry,
		isRunning,
		formatTimestamp: (timestamp: string) => formatTimestamp(timestamp, this.settings),
		formatDuration: (totalTime: number) => formatDuration(totalTime, this.settings),
		orderedEntries: (entries: Entry[]) => orderedEntries(entries, this.settings)
	};

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new TimeTrackerPlusSettingsTab(this.app, this));

		// Register markdown code block processor
		this.registerMarkdownCodeBlockProcessor("time-tracker-plus", (s, e, i) => {
			e.empty();

			let component = new MarkdownRenderChild(e);
			let tracker = loadTracker(s);
			let filePath = i.sourcePath;

			const getFile = () => filePath;

			// Track file renames
			component.registerEvent(
				this.app.vault.on("rename", (file, oldPath) => {
					if (file instanceof TFile && oldPath === filePath) {
						filePath = file.path;
					}
				})
			);

			const sectionInfo = i.getSectionInfo(e);
			if (sectionInfo) {
				displayTracker(tracker, e, getFile, () => sectionInfo, this.settings, component, this.app);
			}
			i.addChild(component);
		});

		// Command: Insert Time Tracker
		this.addCommand({
			id: `insert`,
			name: `Insert Time Tracker`,
			editorCallback: (e, _) => {
				const modal = new TargetTimeModal(this.app, (targetTime) => {
					let tracker: Tracker = { entries: [] };
					if (targetTime && targetTime.trim()) {
						tracker.targetTime = targetTime.trim();
					}
					e.replaceSelection(`\`\`\`time-tracker-plus\n${JSON.stringify(tracker)}\n\`\`\`\n`);
				});
				modal.open();
			}
		});

		// Command: Stop All Running Timers
		this.addCommand({
			id: `stop-all-timers`,
			name: `Stop All Running Timers`,
			callback: async () => {
				let stoppedCount = 0;
				const files = this.app.vault.getMarkdownFiles();

				for (const file of files) {
					try {
						const content = await this.app.vault.read(file);
						const wasStopped = await stopAllRunnersInFile(content, file.path, this.app);
						if (wasStopped) {
							stoppedCount++;
						}
					} catch (e) {
						console.error("Error stopping timers in file:", file.path, e);
					}
				}

				if (stoppedCount > 0) {
					new Notice(`Stopped running timers in ${stoppedCount} file(s)`);
				} else {
					new Notice("No running timers found");
				}
			}
		});

		// Auto-stop timers at specified times
		let lastCheckedMinute = -1;

		const autoStopInterval = window.setInterval(() => {
			const now = moment();
			const currentMinute = now.minutes();

			// Only check once per minute
			if (currentMinute === lastCheckedMinute) {
				return;
			}
			lastCheckedMinute = currentMinute;

			if (shouldAutoStopNow(this.settings.autoStopTimes)) {
				(async () => {
					let stoppedCount = 0;
					const files = this.app.vault.getMarkdownFiles();

					for (const file of files) {
						try {
							const content = await this.app.vault.read(file);
							const wasStopped = await stopAllRunnersInFile(content, file.path, this.app);
							if (wasStopped) {
								stoppedCount++;
							}
						} catch (e) {
							console.error("Error auto-stopping timers in file:", file.path, e);
						}
					}

					if (stoppedCount > 0) {
						new Notice(`Auto-stopped timers in ${stoppedCount} file(s) at ${now.format("HH:mm")}`);
					}
				})();
			}
		}, 1000);

		this.registerInterval(autoStopInterval);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function shouldAutoStopNow(autoStopTimes: string): boolean {
	if (!autoStopTimes || autoStopTimes.trim() === "") {
		return false;
	}

	const now = moment();
	const currentTime = now.format("HH:mm");
	const times = autoStopTimes.split(";").map((t) => t.trim()).filter((t) => t);

	return times.includes(currentTime);
}

