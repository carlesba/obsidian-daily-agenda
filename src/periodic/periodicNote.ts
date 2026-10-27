import { PERIODS } from "./dateNotes.ts";
import type { Period, ResolvedDateNotes } from "./dateNotes.ts";
import type { MomentDate, MomentFactory } from "../time.ts";

export interface NoteFile {
	path: string;
	basename: string;
}

export interface PeriodicNote {
	period: Period;
	date: MomentDate;
	folder: string;
	format: string;
}

export interface TimeRange {
	start: Date;
	end: Date;
}

export function parsePeriodicNote(note: NoteFile, dateNotes: ResolvedDateNotes, moment: MomentFactory): PeriodicNote | undefined {
	const folder = parentFolder(note.path);
	for (const period of PERIODS) {
		const settings = dateNotes.periods[period];
		if (!settings.enabled || settings.folder !== folder) continue;
		const date = moment(note.basename, settings.format, true);
		if (date.isValid()) return { period, date, folder: settings.folder, format: settings.format };
	}
	return undefined;
}

export function periodRange(note: PeriodicNote): TimeRange {
	const unit = note.period === "week" && usesIsoWeeks(note.format) ? "isoWeek" : note.period;
	const start = note.date.clone().startOf(unit);
	const end = start.clone().add(1, note.period);
	return { start: new Date(start.valueOf()), end: new Date(end.valueOf()) };
}

function usesIsoWeeks(format: string): boolean {
	return /[GW]/.test(format.replace(/\[[^\]]*\]/g, ""));
}

function parentFolder(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? "" : path.slice(0, slash);
}
