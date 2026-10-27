import { test } from "node:test";
import { strict as assert } from "node:assert";
import { DEFAULT_CUSTOM_DATE_NOTES, defaultDateNoteSettings, resolveDateNotes } from "../src/periodic/dateNotes.ts";
import type { DateNoteFormats, ResolvedDateNotes } from "../src/periodic/dateNotes.ts";
import { parsePeriodicNote, periodRange } from "../src/periodic/periodicNote.ts";
import { moment } from "./moment.ts";

const note = (path: string) => ({ path, basename: path.split("/").pop()!.replace(/\.md$/, "") });

const custom = (overrides: Partial<DateNoteFormats> = {}): ResolvedDateNotes => ({
	from: "custom",
	periods: { ...DEFAULT_CUSTOM_DATE_NOTES, quarter: { enabled: true, folder: "on", format: "YYYY-[Q]Q" }, ...overrides },
});

const rangeOf = (path: string, dateNotes = custom()) => {
	const periodic = parsePeriodicNote(note(path), dateNotes, moment);
	assert.ok(periodic, `${path} is a periodic note`);
	const { start, end } = periodRange(periodic);
	return { period: periodic.period, start, end };
};

test("a day note covers its local day", () => {
	assert.deepEqual(rangeOf("on/2025-03-14.md"), { period: "day", start: new Date(2025, 2, 14), end: new Date(2025, 2, 15) });
});

test("an ISO week note covers Monday to the next Monday", () => {
	assert.deepEqual(rangeOf("on/2025-W02.md"), { period: "week", start: new Date(2025, 0, 6), end: new Date(2025, 0, 13) });
});

test("a locale week note starts on the locale's first weekday", () => {
	const dateNotes = custom({ week: { enabled: true, folder: "on", format: "gggg-[w]ww" } });
	assert.deepEqual(rangeOf("on/2025-w02.md", dateNotes), {
		period: "week",
		start: new Date(2025, 0, 5),
		end: new Date(2025, 0, 12),
	});
});

test("a month note covers the whole month", () => {
	assert.deepEqual(rangeOf("on/2024-02.md"), { period: "month", start: new Date(2024, 1, 1), end: new Date(2024, 2, 1) });
});

test("a quarter note covers three months", () => {
	assert.deepEqual(rangeOf("on/2025-Q4.md"), { period: "quarter", start: new Date(2025, 9, 1), end: new Date(2026, 0, 1) });
});

test("a year note covers the whole year", () => {
	assert.deepEqual(rangeOf("on/2025.md"), { period: "year", start: new Date(2025, 0, 1), end: new Date(2026, 0, 1) });
});

test("notes outside the period folder or format are not periodic notes", () => {
	assert.equal(parsePeriodicNote(note("elsewhere/2025-03-14.md"), custom(), moment), undefined);
	assert.equal(parsePeriodicNote(note("on/Meeting notes.md"), custom(), moment), undefined);
	const noQuarters = custom({ quarter: { enabled: false, folder: "on", format: "YYYY-[Q]Q" } });
	assert.equal(parsePeriodicNote(note("on/2025-Q4.md"), noQuarters, moment), undefined);
});

test("the Periodic Notes plugin's formats and folders are read before the custom ones", () => {
	const resolved = resolveDateNotes(defaultDateNoteSettings(), {
		periodicNotesSettings: () => ({ daily: { enabled: true, folder: "/journal/", format: "DD.MM.YYYY" } }),
		dailyNotesOptions: () => undefined,
	});
	assert.equal(resolved.from, "periodicNotes");
	assert.deepEqual(rangeOf("journal/14.03.2025.md", resolved).start, new Date(2025, 2, 14));
});

test("the core Daily notes plugin supplies the day format and keeps custom formats for other periods", () => {
	const resolved = resolveDateNotes(defaultDateNoteSettings(), {
		periodicNotesSettings: () => undefined,
		dailyNotesOptions: () => ({ folder: "daily", format: "YYYYMMDD" }),
	});
	assert.equal(resolved.from, "dailyNotes");
	assert.equal(rangeOf("daily/20250314.md", resolved).period, "day");
	assert.equal(rangeOf("on/2025-03.md", resolved).period, "month");
});
