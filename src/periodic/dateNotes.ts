export const PERIODS = ["day", "week", "month", "quarter", "year"] as const;

export type Period = (typeof PERIODS)[number];

export interface PeriodFormat {
	enabled: boolean;
	folder: string;
	format: string;
}

export type DateNoteFormats = Record<Period, PeriodFormat>;

export type DateNoteSource = "periodicNotes" | "dailyNotes" | "custom";

export interface DateNoteSettings {
	from: "auto" | DateNoteSource;
	custom: DateNoteFormats;
}

export interface ResolvedDateNotes {
	from: DateNoteSource;
	periods: DateNoteFormats;
}

export const DEFAULT_CUSTOM_DATE_NOTES: DateNoteFormats = {
	day: { enabled: true, folder: "on", format: "YYYY-MM-DD" },
	week: { enabled: true, folder: "on", format: "GGGG-[W]WW" },
	month: { enabled: true, folder: "on", format: "YYYY-MM" },
	quarter: { enabled: false, folder: "on", format: "YYYY-[Q]Q" },
	year: { enabled: true, folder: "on", format: "YYYY" },
};

const PERIODIC_NOTES_KEYS: Record<Period, string> = {
	day: "daily",
	week: "weekly",
	month: "monthly",
	quarter: "quarterly",
	year: "yearly",
};

const PERIODIC_NOTES_DEFAULT_FORMATS: Record<Period, string> = {
	day: "YYYY-MM-DD",
	week: "gggg-[W]ww",
	month: "YYYY-MM",
	quarter: "YYYY-[Q]Q",
	year: "YYYY",
};

const DAILY_NOTES_DEFAULT_FORMAT = "YYYY-MM-DD";

export interface DateNoteVault {
	periodicNotesSettings(): unknown;
	dailyNotesOptions(): unknown;
}

export function defaultDateNoteSettings(): DateNoteSettings {
	return { from: "auto", custom: mapPeriods((period) => ({ ...DEFAULT_CUSTOM_DATE_NOTES[period] })) };
}

export function resolveDateNotes(settings: DateNoteSettings, vault: DateNoteVault): ResolvedDateNotes {
	const custom = mapPeriods((period) => ({ ...settings.custom[period], folder: normalizeFolder(settings.custom[period].folder) }));
	const candidates: DateNoteSource[] = settings.from === "auto" ? ["periodicNotes", "dailyNotes"] : [settings.from];
	for (const source of candidates) {
		const periods = readSource(source, custom, vault);
		if (periods) return { from: source, periods };
	}
	return { from: "custom", periods: custom };
}

function readSource(source: DateNoteSource, custom: DateNoteFormats, vault: DateNoteVault): DateNoteFormats | undefined {
	if (source === "periodicNotes") return readPeriodicNotes(vault.periodicNotesSettings());
	if (source === "dailyNotes") return readDailyNotes(vault.dailyNotesOptions(), custom);
	return custom;
}

function readPeriodicNotes(settings: unknown): DateNoteFormats | undefined {
	if (!isRecord(settings)) return undefined;
	if (!PERIODS.some((period) => isRecord(settings[PERIODIC_NOTES_KEYS[period]]))) return undefined;
	return mapPeriods((period) => {
		const entry = settings[PERIODIC_NOTES_KEYS[period]];
		if (!isRecord(entry)) return { enabled: false, folder: "", format: PERIODIC_NOTES_DEFAULT_FORMATS[period] };
		return {
			enabled: entry.enabled === true,
			folder: normalizeFolder(entry.folder),
			format: formatOrDefault(entry.format, PERIODIC_NOTES_DEFAULT_FORMATS[period]),
		};
	});
}

function readDailyNotes(options: unknown, custom: DateNoteFormats): DateNoteFormats | undefined {
	if (!isRecord(options)) return undefined;
	const day = {
		enabled: true,
		folder: normalizeFolder(options.folder),
		format: formatOrDefault(options.format, DAILY_NOTES_DEFAULT_FORMAT),
	};
	return { ...custom, day };
}

function mapPeriods(build: (period: Period) => PeriodFormat): DateNoteFormats {
	return { day: build("day"), week: build("week"), month: build("month"), quarter: build("quarter"), year: build("year") };
}

function normalizeFolder(folder: unknown): string {
	return typeof folder === "string" ? folder.trim().replace(/^\/+|\/+$/g, "") : "";
}

function formatOrDefault(format: unknown, fallback: string): string {
	return typeof format === "string" && format.trim() !== "" ? format.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
