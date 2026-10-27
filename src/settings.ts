import { PERIODS, defaultDateNoteSettings } from "./periodic/dateNotes.ts";
import type { DateNoteSettings, Period, PeriodFormat } from "./periodic/dateNotes.ts";

export type AccountKind = "icloud" | "ics";

export const ACCOUNT_KINDS: readonly AccountKind[] = ["icloud", "ics"];

export const ICLOUD_SERVER_URL = "https://caldav.icloud.com";

export interface Account {
	id: string;
	name: string;
	enabled: boolean;
	kind: AccountKind;
	username: string;
	passwordSecret: string;
	serverUrl: string;
	urlSecret: string;
}

export type EventKind = "timed" | "allDay";

export const EVENT_KINDS: readonly EventKind[] = ["timed", "allDay"];

export const ANY = "any";

export type AnyPeriod = typeof ANY | Period;

export interface AgendaTemplate {
	id: string;
	enabled: boolean;
	account: string;
	period: AnyPeriod;
	kind: EventKind;
	body: string;
}

export interface AgendaSettings {
	dateNotes: DateNoteSettings;
	accounts: Account[];
	templates: AgendaTemplate[];
}

export const DEFAULT_TIMED_TEMPLATE = "- [ ] 🗓️ **{{start:HH:mm}}**–**{{end:HH:mm}}** ({{account}}) {{title}}";

export const DEFAULT_ALL_DAY_TEMPLATE = "- [ ] 🗓️ ({{account}}) {{title}}";

export function defaultSettings(): AgendaSettings {
	return {
		dateNotes: defaultDateNoteSettings(),
		accounts: [],
		templates: [
			{ id: "template-1", enabled: true, account: ANY, period: ANY, kind: "timed", body: DEFAULT_TIMED_TEMPLATE },
			{ id: "template-2", enabled: true, account: ANY, period: ANY, kind: "allDay", body: DEFAULT_ALL_DAY_TEMPLATE },
		],
	};
}

export function mergeSettings(stored: unknown): AgendaSettings {
	const defaults = defaultSettings();
	if (!isRecord(stored)) return defaults;
	return {
		dateNotes: readDateNotes(stored.dateNotes, defaults.dateNotes),
		accounts: Array.isArray(stored.accounts) ? uniqueIds(stored.accounts.flatMap(readAccount)) : defaults.accounts,
		templates: Array.isArray(stored.templates) ? uniqueIds(stored.templates.flatMap(readTemplate)) : defaults.templates,
	};
}

export function newId(entries: readonly { id: string }[], prefix: string): string {
	const taken = new Set(entries.map((entry) => entry.id));
	let number = entries.length + 1;
	while (taken.has(`${prefix}-${number}`)) number++;
	return `${prefix}-${number}`;
}

export function newAccount(accounts: readonly Account[], kind: AccountKind = "icloud"): Account {
	return {
		id: newId(accounts, "account"),
		name: "",
		enabled: true,
		kind,
		username: "",
		passwordSecret: "",
		serverUrl: ICLOUD_SERVER_URL,
		urlSecret: "",
	};
}

export function newTemplate(templates: readonly AgendaTemplate[]): AgendaTemplate {
	return { id: newId(templates, "template"), enabled: true, account: ANY, period: ANY, kind: "timed", body: DEFAULT_TIMED_TEMPLATE };
}

export function isAccountKind(value: unknown): value is AccountKind {
	return ACCOUNT_KINDS.some((kind) => kind === value);
}

export function isEventKind(value: unknown): value is EventKind {
	return EVENT_KINDS.some((kind) => kind === value);
}

export function isAnyPeriod(value: unknown): value is AnyPeriod {
	return value === ANY || PERIODS.some((period) => period === value);
}

function readAccount(stored: unknown): Account[] {
	if (!isRecord(stored) || typeof stored.id !== "string" || stored.id === "") return [];
	return [
		{
			id: stored.id,
			name: stringOr(stored.name, ""),
			enabled: stored.enabled !== false,
			kind: isAccountKind(stored.kind) ? stored.kind : "icloud",
			username: stringOr(stored.username, ""),
			passwordSecret: stringOr(stored.passwordSecret, ""),
			serverUrl: stringOr(stored.serverUrl, ICLOUD_SERVER_URL),
			urlSecret: stringOr(stored.urlSecret, ""),
		},
	];
}

function readTemplate(stored: unknown): AgendaTemplate[] {
	if (!isRecord(stored) || typeof stored.id !== "string" || stored.id === "") return [];
	return [
		{
			id: stored.id,
			enabled: stored.enabled !== false,
			account: stringOr(stored.account, ANY) || ANY,
			period: isAnyPeriod(stored.period) ? stored.period : ANY,
			kind: isEventKind(stored.kind) ? stored.kind : "timed",
			body: stringOr(stored.body, ""),
		},
	];
}

function readDateNotes(stored: unknown, defaults: DateNoteSettings): DateNoteSettings {
	if (!isRecord(stored)) return defaults;
	const from = ["auto", "periodicNotes", "dailyNotes", "custom"].find((source) => source === stored.from) as DateNoteSettings["from"] | undefined;
	const custom = isRecord(stored.custom) ? stored.custom : {};
	const readPeriod = (period: Period): PeriodFormat => {
		const entry = custom[period];
		const fallback = defaults.custom[period];
		if (!isRecord(entry)) return fallback;
		return {
			enabled: typeof entry.enabled === "boolean" ? entry.enabled : fallback.enabled,
			folder: stringOr(entry.folder, fallback.folder),
			format: stringOr(entry.format, fallback.format).trim() || fallback.format,
		};
	};
	return {
		from: from ?? defaults.from,
		custom: {
			day: readPeriod("day"),
			week: readPeriod("week"),
			month: readPeriod("month"),
			quarter: readPeriod("quarter"),
			year: readPeriod("year"),
		},
	};
}

function uniqueIds<Entry extends { id: string }>(entries: Entry[]): Entry[] {
	const seen = new Set<string>();
	return entries.filter((entry) => !seen.has(entry.id) && seen.add(entry.id));
}

function stringOr(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
