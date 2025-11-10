import { moment, ButtonComponent, TextComponent, MarkdownRenderer, TFile, App, Component } from "obsidian";
import { TimeTrackerPlusSettings } from "./settings";
import { ConfirmModal } from "./confirm-modal";

export interface Entry {
	name: string;
	startTime: string | null;
	endTime: string | null;
	subEntries?: Entry[];
	collapsed?: boolean;
}

export interface Tracker {
	entries: Entry[];
	targetTime?: string;
}

interface SectionInfo {
	lineStart: number;
	lineEnd: number;
}

// Save and Load Functions
export async function saveTracker(tracker: Tracker, fileName: string, section: SectionInfo, app: App): Promise<void> {
	let file = app.vault.getAbstractFileByPath(fileName);
	if (!file || !(file instanceof TFile)) return;

	let content = await app.vault.read(file);
	let lines = content.split("\n");

	let prev = lines.filter((_: string, i: number) => i <= section.lineStart).join("\n");
	let next = lines.filter((_: string, i: number) => i >= section.lineEnd).join("\n");

	content = `${prev}\n${JSON.stringify(tracker)}\n${next}`;
	await app.vault.modify(file, content);
}

export function loadTracker(json: string): Tracker {
	if (json) {
		try {
			let ret: Tracker = JSON.parse(json);
			updateLegacyInfo(ret.entries);
			return ret;
		} catch (e) {
			console.error(`Failed to parse Tracker from ${json}`, e);
		}
	}
	return { entries: [] };
}

export async function loadAllTrackers(fileName: string, app: App): Promise<Array<{ section: SectionInfo, tracker: Tracker }>> {
	let file = app.vault.getAbstractFileByPath(fileName);
	if (!file || !(file instanceof TFile)) return [];
	
	let content = (await app.vault.cachedRead(file)).split("\n");

	let trackers: Array<{ section: SectionInfo, tracker: Tracker }> = [];
	let curr: { lineStart: number; text: string; lineEnd?: number } | undefined;

	for (let i = 0; i < content.length; i++) {
		let line = content[i];
		if (line.trimEnd() == "```time-tracker-plus") {
			curr = { lineStart: i + 1, text: "" };
		} else if (curr) {
			if (line.trimEnd() == "```") {
				curr.lineEnd = i - 1;
				let tracker = loadTracker(curr.text);
				trackers.push({ section: curr as SectionInfo, tracker });
				curr = undefined;
			} else {
				curr.text += `${line}\n`;
			}
		}
	}
	return trackers;
}

function updateLegacyInfo(entries: Entry[]): void {
	for (let entry of entries) {
		// Convert old Unix timestamps to ISO strings
		if (entry.startTime && !isNaN(+entry.startTime))
			entry.startTime = moment.unix(+entry.startTime).toISOString();
		if (entry.endTime && !isNaN(+entry.endTime))
			entry.endTime = moment.unix(+entry.endTime).toISOString();

		// Clean up empty subEntries
		if (entry.subEntries == null || !entry.subEntries.length)
			entry.subEntries = undefined;
		if (entry.subEntries)
			updateLegacyInfo(entry.subEntries);
	}
}

// Display Functions
export function displayTracker(
	tracker: Tracker,
	element: HTMLElement,
	getFile: () => string,
	getSectionInfo: () => SectionInfo,
	settings: TimeTrackerPlusSettings,
	component: Component,
	app: App
): void {
	element.addClass("time-tracker-plus-container");

	let running = isRunning(tracker);
	let newSegmentNameBox: { getValue: () => string } = { getValue: () => "" };
	let durationCells: Array<{ entry: Entry; cell: HTMLElement }> = [];

	// Progress bar
	let progressBar: HTMLElement | undefined, progressFill: HTMLElement | undefined, progressText: HTMLElement | undefined;
	if (tracker.targetTime) {
		let progressContainer = element.createEl("div", { cls: "time-tracker-plus-progress-container" });
		progressBar = progressContainer.createEl("div", { cls: "time-tracker-plus-progress-bar" });
		progressFill = progressBar.createEl("div", { cls: "time-tracker-plus-progress-fill" });
		if (running) {
			progressFill.addClass("time-tracker-plus-progress-running");
		}
		progressText = progressContainer.createEl("div", { cls: "time-tracker-plus-progress-text" });
		updateProgressBar(tracker, progressFill, progressText, settings);
	}

	// Tracker table
	if (tracker.entries.length > 0) {
		let table = element.createEl("table", { cls: "time-tracker-plus-table" });
		table
			.createEl("tr")
			.append(
				createEl("th", { text: "Segment" }),
				createEl("th", { text: "Start time" }),
				createEl("th", { text: "End time" }),
				createEl("th", { text: "Duration" }),
				createEl("th")
			);

		for (let entry of orderedEntries(tracker.entries, settings))
			addEditableTableRow(
				tracker,
				entry,
				table,
				newSegmentNameBox,
				running,
				getFile,
				getSectionInfo,
				settings,
				0,
				component,
				durationCells,
				app
			);
	} else {
		// Empty tracker - show play button
		let btn = new ButtonComponent(element)
			.setClass("clickable-icon")
			.setIcon("lucide-play-circle")
			.setTooltip("Start")
			.onClick(async () => {
				await stopAllOtherRunningTimers(app, getFile());
				startNewEntry(tracker, newSegmentNameBox.getValue());
				await saveTracker(tracker, getFile(), getSectionInfo(), app);
			});
		btn.buttonEl.addClass("time-tracker-plus-btn");
	}

	// Update interval for running timers
	let intervalId = window.setInterval(() => {
		if (!element.isConnected) {
			window.clearInterval(intervalId);
			return;
		}

		for (let { entry, cell } of durationCells) {
			cell.setText(formatDuration(getDuration(entry), settings));
		}

		if (tracker.targetTime && progressFill && progressText) {
			updateProgressBar(tracker, progressFill, progressText, settings);
		}
	}, 1000);
}

function updateProgressBar(tracker: Tracker, progressFill: HTMLElement, progressText: HTMLElement, settings: TimeTrackerPlusSettings): void {
	const totalDuration = getTotalDuration(tracker.entries);
	const targetDuration = parseTargetTime(tracker.targetTime);

	if (targetDuration > 0) {
		const percentage = (totalDuration / targetDuration) * 100;
		const displayPercentage = Math.min(100, percentage);

		progressFill.setCssStyles({ width: `${displayPercentage}%` });

		// Remove all color classes
		progressFill.removeClass("time-tracker-plus-progress-green");
		progressFill.removeClass("time-tracker-plus-progress-yellow");
		progressFill.removeClass("time-tracker-plus-progress-orange");
		progressFill.removeClass("time-tracker-plus-progress-red");
		progressText.removeClass("time-tracker-plus-progress-text-green");
		progressText.removeClass("time-tracker-plus-progress-text-yellow");
		progressText.removeClass("time-tracker-plus-progress-text-orange");
		progressText.removeClass("time-tracker-plus-progress-text-red");

		// Add appropriate color class
		let colorClass = "green";
		if (percentage >= 100) {
			colorClass = "red";
		} else if (percentage >= 85) {
			colorClass = "orange";
		} else if (percentage >= 70) {
			colorClass = "yellow";
		}

		progressFill.addClass(`time-tracker-plus-progress-${colorClass}`);
		progressText.addClass(`time-tracker-plus-progress-text-${colorClass}`);

		const runningText = isRunning(tracker) ? " ● RUNNING" : "";
		progressText.setText(`${formatDuration(totalDuration, settings)} / ${tracker.targetTime} (${percentage.toFixed(1)}%)${runningText}`);

		if (isRunning(tracker)) {
			progressText.addClass("time-tracker-plus-progress-text-running");
		} else {
			progressText.removeClass("time-tracker-plus-progress-text-running");
		}
	}
}

function parseTargetTime(targetTime: string | undefined): number {
	if (!targetTime) return 0;

	const regex = /(?:(\d+)y)?(?:(\d+)M)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
	const match = targetTime.match(regex);
	if (!match) return 0;

	const years = parseInt(match[1] || "0");
	const months = parseInt(match[2] || "0");
	const days = parseInt(match[3] || "0");
	const hours = parseInt(match[4] || "0");
	const minutes = parseInt(match[5] || "0");
	const seconds = parseInt(match[6] || "0");

	return (
		(years * 365 * 24 * 60 * 60 +
			months * 30 * 24 * 60 * 60 +
			days * 24 * 60 * 60 +
			hours * 60 * 60 +
			minutes * 60 +
			seconds) *
		1000
	);
}

// Duration Functions
export function getDuration(entry: Entry): number {
	if (entry.subEntries) {
		return getTotalDuration(entry.subEntries);
	} else {
		let endTime = entry.endTime ? moment(entry.endTime) : moment();
		return endTime.diff(moment(entry.startTime));
	}
}

export function getDurationToday(entry: Entry): number {
	if (entry.subEntries) {
		return getTotalDurationToday(entry.subEntries);
	} else {
		let today = moment().startOf("day");
		let endTime = entry.endTime ? moment(entry.endTime) : moment();
		let startTime = moment(entry.startTime);

		if (endTime.isBefore(today)) {
			return 0;
		}
		if (startTime.isBefore(today)) {
			startTime = today;
		}
		return endTime.diff(startTime);
	}
}

export function getTotalDuration(entries: Entry[]): number {
	let ret = 0;
	for (let entry of entries) ret += getDuration(entry);
	return ret;
}

export function getTotalDurationToday(entries: Entry[]): number {
	let ret = 0;
	for (let entry of entries) ret += getDurationToday(entry);
	return ret;
}

export function isRunning(tracker: Tracker): boolean {
	return !!getRunningEntry(tracker.entries);
}

export function getRunningEntry(entries: Entry[]): Entry | null {
	for (let entry of entries) {
		if (entry.subEntries) {
			let running = getRunningEntry(entry.subEntries);
			if (running) return running;
		} else {
			if (!entry.endTime) return entry;
		}
	}
	return null;
}

// Entry Management Functions
export function startSubEntry(entry: Entry, name: string): void {
	if (!entry.subEntries) {
		entry.subEntries = [{ ...entry, name: `Part 1` }];
		entry.startTime = null;
		entry.endTime = null;
	}

	if (!name) name = `Part ${entry.subEntries.length + 1}`;
	entry.subEntries.push({
		name,
		startTime: moment().toISOString(),
		endTime: null,
		subEntries: undefined
	});
}

export function startNewEntry(tracker: Tracker, name: string): void {
	if (!name) name = `Segment ${tracker.entries.length + 1}`;
	let entry: Entry = {
		name,
		startTime: moment().toISOString(),
		endTime: null,
		subEntries: undefined
	};
	tracker.entries.push(entry);
}



function endRunningEntryInSegment(entry: Entry): void {
	if (entry.subEntries) {
		let running = getRunningEntry(entry.subEntries);
		if (running) {
			running.endTime = moment().toISOString();
		}
	} else if (!entry.endTime) {
		entry.endTime = moment().toISOString();
	}
}

function hasRunningEntry(entry: Entry): boolean {
	if (entry.subEntries) {
		return getRunningEntry(entry.subEntries) != null;
	} else {
		return !entry.endTime;
	}
}

export function removeEntry(entries: Entry[], toRemove: Entry): boolean {
	if (entries.contains(toRemove)) {
		entries.remove(toRemove);
		return true;
	} else {
		for (let entry of entries) {
			if (entry.subEntries && removeEntry(entry.subEntries, toRemove)) {
				// If only one sub-entry remains, flatten it
				if (entry.subEntries.length == 1) {
					let single = entry.subEntries[0];
					entry.startTime = single.startTime;
					entry.endTime = single.endTime;
					entry.subEntries = undefined;
				}
				return true;
			}
		}
	}
	return false;
}

// Formatting Functions
export function formatTimestamp(timestamp: string, settings: TimeTrackerPlusSettings): string {
	return moment(timestamp).format(settings.timestampFormat);
}

export function formatDuration(totalTime: number, settings: TimeTrackerPlusSettings): string {
	let ret = "";
	let duration = moment.duration(totalTime);
	let hours = settings.fineGrainedDurations ? duration.hours() : Math.floor(duration.asHours());

	if (settings.timestampDurations) {
		if (settings.fineGrainedDurations) {
			let days = Math.floor(duration.asDays());
			if (days > 0) ret += days + ".";
		}
		ret += `${hours.toString().padStart(2, "0")}:${duration.minutes().toString().padStart(2, "0")}:${duration.seconds().toString().padStart(2, "0")}`;
	} else {
		if (settings.fineGrainedDurations) {
			let years = Math.floor(duration.asYears());
			if (years > 0) ret += years + "y ";
			if (duration.months() > 0) ret += duration.months() + "M ";
			if (duration.days() > 0) ret += duration.days() + "d ";
		}
		if (hours > 0) ret += hours + "h ";
		if (duration.minutes() > 0) ret += duration.minutes() + "m ";
		ret += duration.seconds() + "s";
	}
	return ret;
}

function formatEditableTimestamp(timestamp: string, settings: TimeTrackerPlusSettings): string {
	return moment(timestamp).format(settings.editableTimestampFormat);
}

function unformatEditableTimestamp(formatted: string, settings: TimeTrackerPlusSettings): string {
	return moment(formatted, settings.editableTimestampFormat).toISOString();
}

export function orderedEntries(entries: Entry[], settings: TimeTrackerPlusSettings): Entry[] {
	return settings.reverseSegmentOrder ? entries.slice().reverse() : entries;
}





function createTableSection(entry: Entry, settings: TimeTrackerPlusSettings, indent = 0): string[][] {
	const prefix = `${"-".repeat(indent)} `;
	let ret: string[][] = [
		[
			`${prefix}${entry.name}`,
			entry.startTime ? formatTimestamp(entry.startTime, settings) : "",
			entry.endTime ? formatTimestamp(entry.endTime, settings) : "",
			entry.endTime || entry.subEntries ? formatDuration(getDuration(entry), settings) : ""
		]
	];

	if (entry.subEntries) {
		for (let sub of orderedEntries(entry.subEntries, settings))
			ret.push(...createTableSection(sub, settings, indent + 1));
	}
	return ret;
}



	// Editable Field Classes
class EditableField {
	cell: HTMLElement;
	label: HTMLElement;
	box: TextComponent;
	onSave?: () => void | Promise<void>;
	onCancel?: () => void;

	constructor(row: HTMLElement, indent: number, value: string) {
		this.cell = row.createEl("td");
		this.label = this.cell.createEl("span", { text: value, cls: "time-tracker-plus-field-indent" });
		this.label.setCssStyles({ "--time-tracker-plus-indent": `${indent}em` } as Record<string, string>);
		this.box = new TextComponent(this.cell).setValue(value);
		this.box.inputEl.addClass("time-tracker-plus-input");
		this.box.inputEl.hide();

		this.box.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.onSave?.();
			}
			if (e.key === "Escape") {
				e.preventDefault();
				this.onCancel?.();
			}
		});
	}

	editing(): boolean {
		return this.label.hidden;
	}

	beginEdit(value: string, focus = false): void {
		this.label.hidden = true;
		this.box.setValue(value);
		this.box.inputEl.show();
		if (focus) this.box.inputEl.focus();
	}

	endEdit(): string {
		const value = this.box.getValue();
		this.label.setText(value);
		this.box.inputEl.hide();
		this.label.hidden = false;
		return value;
	}
}

class EditableTimestampField extends EditableField {
	private settings: TimeTrackerPlusSettings;

	constructor(row: HTMLElement, value: string | null, settings: TimeTrackerPlusSettings) {
		super(row, 0, value ? formatTimestamp(value, settings) : "");
		this.settings = settings;
	}

	beginEdit(value: string | null, focus = false): void {
		super.beginEdit(value ? formatEditableTimestamp(value, this.settings) : "", focus);
	}

	endEdit(): string {
		const value = this.box.getValue();
		let displayValue = value;
		if (value) {
			const timestamp = unformatEditableTimestamp(value, this.settings);
			displayValue = formatTimestamp(timestamp, this.settings);
		}
		this.label.setText(displayValue);
		this.box.inputEl.hide();
		this.label.hidden = false;
		return value;
	}

	getTimestamp(): string | null {
		if (this.box.getValue()) {
			return unformatEditableTimestamp(this.box.getValue(), this.settings);
		} else {
			return null;
		}
	}
}

// Table Row Functions
function addEditableTableRow(
	tracker: Tracker,
	entry: Entry,
	table: HTMLElement,
	newSegmentNameBox: { getValue: () => string },
	trackerRunning: boolean,
	getFile: () => string,
	getSectionInfo: () => SectionInfo,
	settings: TimeTrackerPlusSettings,
	indent: number,
	component: Component,
	durationCells: Array<{ entry: Entry; cell: HTMLElement }>,
	app: App
): void {
	let entryRunning = hasRunningEntry(entry);
	let row = table.createEl("tr");
	if (entryRunning) {
		row.addClass("time-tracker-plus-running");
	}

	let nameField = new EditableField(row, indent, entry.name);
	let startField = new EditableTimestampField(row, entry.startTime, settings);
	let endField = new EditableTimestampField(row, entry.endTime, settings);

	let durationCell = row.createEl("td", { text: formatDuration(getDuration(entry), settings) });
	if (entryRunning) {
		durationCell.addClass("time-tracker-plus-duration-running");
		nameField.cell.createSpan({
			cls: "time-tracker-plus-running-indicator",
			text: " ● RUNNING"
		});
	}

	if (durationCells) {
		durationCells.push({ entry, cell: durationCell });
	}

	renderNameAsMarkdown(nameField.label, getFile, component, app);

	// Expand/collapse button
	let expandButton = new ButtonComponent(nameField.label)
		.setClass("clickable-icon")
		.setClass("time-tracker-plus-expand-button")
		.setIcon(`chevron-${entry.collapsed ? "left" : "down"}`)
		.onClick(async () => {
			if (entry.collapsed) {
				entry.collapsed = undefined;
			} else {
				entry.collapsed = true;
			}
			await saveTracker(tracker, getFile(), getSectionInfo(), app);
		});

	if (!entry.subEntries) expandButton.buttonEl.addClass("time-tracker-plus-expand-button-hidden");

	// Entry buttons
	let entryButtons = row.createEl("td");
	entryButtons.addClass("time-tracker-plus-table-buttons");

	if (indent === 0) {
		// Continue button
		new ButtonComponent(entryButtons)
			.setClass("clickable-icon")
			.setIcon(`lucide-play`)
			.setTooltip("Continue")
			.setDisabled(trackerRunning)
			.onClick(async () => {
				await stopAllOtherRunningTimers(app, getFile());
				startSubEntry(entry, newSegmentNameBox.getValue());
				await saveTracker(tracker, getFile(), getSectionInfo(), app);
			});

		// Stop button
		new ButtonComponent(entryButtons)
			.setClass("clickable-icon")
			.setIcon(`lucide-stop-circle`)
			.setTooltip("Stop")
			.setDisabled(!entryRunning)
			.onClick(async () => {
				endRunningEntryInSegment(entry);
				await saveTracker(tracker, getFile(), getSectionInfo(), app);
			});
	}

	// Edit button
	let editButton = new ButtonComponent(entryButtons)
		.setClass("clickable-icon")
		.setTooltip("Edit")
		.setIcon("lucide-pencil")
		.onClick(async () => {
			await handleEdit();
		});

	// Double-click to edit
	nameField.label.addEventListener("dblclick", async () => {
		if (!nameField.editing()) {
			await handleEdit();
		}
	});

	async function handleEdit() {
		if (nameField.editing()) {
			await saveChanges();
		} else {
			startEditing();
		}
	}

	async function saveChanges() {
		entry.name = nameField.endEdit();
		expandButton.buttonEl.removeClass("time-tracker-plus-expand-button-editing");
		startField.endEdit();
		entry.startTime = startField.getTimestamp();

		if (!entryRunning) {
			endField.endEdit();
			entry.endTime = endField.getTimestamp();
		}

		await saveTracker(tracker, getFile(), getSectionInfo(), app);
		editButton.setIcon("lucide-pencil");
		renderNameAsMarkdown(nameField.label, getFile, component, app);
	}

	function startEditing() {
		nameField.beginEdit(entry.name, true);
		expandButton.buttonEl.addClass("time-tracker-plus-expand-button-editing");

		if (!entry.subEntries) {
			startField.beginEdit(entry.startTime);
			if (!entryRunning) endField.beginEdit(entry.endTime);
		}

		editButton.setIcon("lucide-check");

		nameField.onSave = startField.onSave = endField.onSave = async () => {
			await saveChanges();
		};

		nameField.onCancel = startField.onCancel = endField.onCancel = () => {
			nameField.endEdit();
			startField.endEdit();
			if (!entryRunning) {
				endField.endEdit();
			}
			expandButton.buttonEl.removeClass("time-tracker-plus-expand-button-editing");
			editButton.setIcon("lucide-pencil");
		};
	}

	// Remove button
	new ButtonComponent(entryButtons)
		.setClass("clickable-icon")
		.setTooltip("Remove")
		.setIcon("lucide-trash")
		.setDisabled(entryRunning)
		.onClick(async () => {
			const confirmed = await showConfirm("Are you sure you want to delete this entry?", app);
			if (!confirmed) {
				return;
			}
			removeEntry(tracker.entries, entry);
			await saveTracker(tracker, getFile(), getSectionInfo(), app);
		});

	// Render sub-entries
	if (entry.subEntries && !entry.collapsed) {
		for (let sub of orderedEntries(entry.subEntries, settings))
			addEditableTableRow(
				tracker,
				sub,
				table,
				newSegmentNameBox,
				trackerRunning,
				getFile,
				getSectionInfo,
				settings,
				indent + 1,
				component,
				durationCells,
				app
			);
	}
}

function showConfirm(message: string, app: App): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new ConfirmModal(app, message, resolve);
		modal.open();
	});
}

function renderNameAsMarkdown(label: HTMLElement, getFile: () => string, component: Component, app: App): void {
	const text = label.textContent || "";
	label.empty();

	MarkdownRenderer.render(app, text, label, getFile(), component).then(() => {
		const paragraph = label.querySelector("p");
		if (paragraph) {
			while (paragraph.firstChild) {
				label.appendChild(paragraph.firstChild);
			}
			paragraph.remove();
		}
	}).catch((e) => {
		console.error("Failed to render markdown in tracker", e);
	});
}

// Auto-stop Functions
export async function stopAllOtherRunningTimers(app: App, currentFileName: string): Promise<void> {
	const files = app.vault.getMarkdownFiles();
	for (const file of files) {
		try {
			const content = await app.vault.read(file);
			await stopAllRunnersInFile(content, file.path, app);
		} catch (e) {
			console.error("Error stopping timers in file:", file.path, e);
		}
	}
}

export async function stopAllRunnersInFile(fileContent: string, fileName: string, app: App): Promise<boolean> {
	const codeBlockRegex = /```time-tracker-plus\n([\s\S]*?)\n```/g;
	let match;
	let modified = false;
	let newContent = fileContent;

	while ((match = codeBlockRegex.exec(fileContent)) !== null) {
		try {
			const tracker: Tracker = JSON.parse(match[1]);
			if (isRunning(tracker)) {
				const runningEntry = getRunningEntry(tracker.entries);
				if (runningEntry) {
					runningEntry.endTime = moment().toISOString();
					const updatedTracker = JSON.stringify(tracker);
					newContent = newContent.replace(match[0], `\`\`\`time-tracker-plus\n${updatedTracker}\n\`\`\``);
					modified = true;
				}
			}
		} catch (e) {
			// Ignore parse errors for invalid tracker blocks
			console.debug("Skipping invalid tracker block", e);
		}
	}

	if (modified) {
		const file = app.vault.getAbstractFileByPath(fileName);
		if (file instanceof TFile) {
			await app.vault.modify(file, newContent);
		}
	}

	return modified;
}

