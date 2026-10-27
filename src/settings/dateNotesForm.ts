import { t } from "../i18n/index.ts";
import type { TranslationKey } from "../i18n/index.ts";
import { PERIODS, resolveDateNotes } from "../periodic/dateNotes.ts";
import type { DateNoteSettings, DateNoteVault, Period, PeriodFormat } from "../periodic/dateNotes.ts";

type DateNoteSource = DateNoteSettings["from"];

const DATE_NOTE_SOURCES: readonly DateNoteSource[] = ["auto", "periodicNotes", "dailyNotes", "custom"];

const PERIODIC_NOTES = "Periodic Notes";

const PERIOD_KEYS: Record<Period, TranslationKey> = {
	day: "periodDay",
	week: "periodWeek",
	month: "periodMonth",
	quarter: "periodQuarter",
	year: "periodYear",
};

export type PeriodField = keyof PeriodFormat;

export function dateNoteSourceOptions(): Record<DateNoteSource, string> {
	return { auto: t("automatic"), periodicNotes: PERIODIC_NOTES, dailyNotes: t("dailyNotes"), custom: t("custom") };
}

export function periodName(period: Period): string {
	return t(PERIOD_KEYS[period]);
}

export function customPeriods(settings: DateNoteSettings, vault: DateNoteVault): Period[] {
	const { from } = resolveDateNotes(settings, vault);
	if (from === "periodicNotes") return [];
	return from === "dailyNotes" ? PERIODS.filter((period) => period !== "day") : [...PERIODS];
}

export function dateNoteSourceDescription(settings: DateNoteSettings, vault: DateNoteVault): string {
	const { from } = resolveDateNotes(settings, vault);
	const reading =
		from === "periodicNotes"
			? t("readingPeriodicNotes")
			: from === "dailyNotes"
				? t("readingDailyNotes")
				: t("readingCustom");
	if (settings.from === "auto") return `${t("automaticOrder")} ${reading}`;
	if (settings.from !== from) return `${t("sourceNotEnabled", { source: dateNoteSourceOptions()[settings.from] })} ${reading}`;
	return reading;
}

export function writeDateNoteSource(settings: DateNoteSettings, value: unknown): boolean {
	const from = DATE_NOTE_SOURCES.find((source) => source === value);
	if (from) settings.from = from;
	return from !== undefined;
}

export function readPeriodField(settings: DateNoteSettings, period: Period, field: PeriodField): unknown {
	return settings.custom[period][field];
}

export function writePeriodField(settings: DateNoteSettings, period: Period, field: PeriodField, value: unknown): boolean {
	const format = settings.custom[period];
	if (field === "enabled") format.enabled = value === true;
	else if (typeof value === "string") format[field] = value.trim();
	else return false;
	return true;
}

export function formatError(value: string): string | undefined {
	return value.trim() === "" ? t("formatRequired") : undefined;
}

export function isPeriod(value: string): value is Period {
	return (PERIODS as readonly string[]).includes(value);
}
