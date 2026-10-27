import type { Period } from "../periodic/dateNotes.ts";
import { isAccountKind, isAnyPeriod, isEventKind } from "../settings.ts";
import type { Account, AgendaSettings, AgendaTemplate } from "../settings.ts";
import { isPeriod, readPeriodField, writeDateNoteSource, writePeriodField } from "./dateNotesForm.ts";
import type { PeriodField } from "./dateNotesForm.ts";

export const DATE_NOTE_SOURCE_KEY = "dateNotes/from";

export type AccountField = "enabled" | "name" | "kind" | "username" | "passwordSecret" | "serverUrl" | "urlSecret" | "clientId" | "clientSecret";

export type TemplateField = "enabled" | "account" | "period" | "kind" | "body";

export const TYPED_FIELDS: readonly string[] = ["name", "username", "serverUrl", "clientId", "body", "folder", "format"];

const CALENDAR_FIELD = "calendar";

export function accountKey(id: string, field: AccountField): string {
	return `account/${id}/${field}`;
}

export function calendarKey(accountId: string, calendarId: string): string {
	return `account/${accountId}/${CALENDAR_FIELD}/${encodeURIComponent(calendarId)}`;
}

export function templateKey(id: string, field: TemplateField): string {
	return `template/${id}/${field}`;
}

export function periodKey(period: Period, field: PeriodField): string {
	return `dateNotes/${period}/${field}`;
}

export function readControl(settings: AgendaSettings, key: string): unknown {
	if (key === DATE_NOTE_SOURCE_KEY) return settings.dateNotes.from;
	const [scope, name, field, calendarId] = key.split("/");
	if (scope === "dateNotes" && isPeriod(name)) return readPeriodField(settings.dateNotes, name, field as PeriodField);
	if (scope === "account") {
		const account = settings.accounts.find((candidate) => candidate.id === name);
		if (field === CALENDAR_FIELD) return account?.calendars.find((calendar) => calendar.id === decodeURIComponent(calendarId ?? ""))?.enabled;
		return account?.[field as AccountField];
	}
	if (scope === "template") return settings.templates.find((template) => template.id === name)?.[field as TemplateField];
	return undefined;
}

export function writeControl(settings: AgendaSettings, key: string, value: unknown): boolean {
	if (key === DATE_NOTE_SOURCE_KEY) return writeDateNoteSource(settings.dateNotes, value);
	const [scope, name, field, calendarId] = key.split("/");
	if (scope === "dateNotes" && isPeriod(name)) return writePeriodField(settings.dateNotes, name, field as PeriodField, value);
	if (scope === "account") {
		const account = settings.accounts.find((candidate) => candidate.id === name);
		if (!account) return false;
		if (field === CALENDAR_FIELD) return writeCalendarEnabled(account, decodeURIComponent(calendarId ?? ""), value);
		return writeAccountField(account, field as AccountField, value);
	}
	if (scope === "template") {
		const template = settings.templates.find((candidate) => candidate.id === name);
		return template ? writeTemplateField(template, field as TemplateField, value) : false;
	}
	return false;
}

function writeAccountField(account: Account, field: AccountField, value: unknown): boolean {
	if (field === "enabled") {
		account.enabled = value === true;
		return true;
	}
	if (field === "kind") {
		if (!isAccountKind(value)) return false;
		account.kind = value;
		return true;
	}
	if (typeof value !== "string") return false;
	account[field] = field === "name" ? value : value.trim();
	return true;
}

function writeCalendarEnabled(account: Account, calendarId: string, value: unknown): boolean {
	const calendar = account.calendars.find((candidate) => candidate.id === calendarId);
	if (!calendar || typeof value !== "boolean") return false;
	calendar.enabled = value;
	return true;
}

function writeTemplateField(template: AgendaTemplate, field: TemplateField, value: unknown): boolean {
	switch (field) {
		case "enabled":
			template.enabled = value === true;
			return true;
		case "kind":
			if (!isEventKind(value)) return false;
			template.kind = value;
			return true;
		case "period":
			if (!isAnyPeriod(value)) return false;
			template.period = value;
			return true;
		case "account":
			if (typeof value !== "string") return false;
			template.account = value;
			return true;
		case "body":
			if (typeof value !== "string") return false;
			template.body = value.replace(/[\r\n]+/g, " ");
			return true;
	}
}
