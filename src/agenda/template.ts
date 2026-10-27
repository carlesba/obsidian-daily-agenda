import { ANY } from "../settings.ts";
import type { AgendaTemplate } from "../settings.ts";
import type { AgendaEvent } from "../calendar/event.ts";
import type { Period } from "../periodic/dateNotes.ts";
import type { MomentFactory } from "../time.ts";

export const PLACEHOLDERS = [
	"title",
	"account",
	"calendar",
	"start",
	"end",
	"date",
	"location",
	"description",
	"url",
	"organizer",
	"attendees",
	"status",
] as const;

export type Placeholder = (typeof PLACEHOLDERS)[number];

export const DEFAULT_TIME_FORMAT = "HH:mm";

export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

export function matchingTemplate(templates: readonly AgendaTemplate[], event: AgendaEvent, period: Period): AgendaTemplate | undefined {
	let best: AgendaTemplate | undefined;
	let bestSpecificity = -1;
	for (const template of templates) {
		if (!matches(template, event, period)) continue;
		const specificity = Number(template.account !== ANY) + Number(template.period !== ANY);
		if (specificity > bestSpecificity) {
			best = template;
			bestSpecificity = specificity;
		}
	}
	return best;
}

export function renderTemplate(body: string, event: AgendaEvent, moment: MomentFactory): string {
	return body.replace(/\{\{\s*(\w+)(?::([^}]*))?\s*\}\}/g, (typed: string, name: string, format: string | undefined) => {
		const value = placeholderValue(name, format, event, moment);
		return value === undefined ? typed : value;
	});
}

function matches(template: AgendaTemplate, event: AgendaEvent, period: Period): boolean {
	return (
		template.enabled &&
		template.kind === (event.allDay ? "allDay" : "timed") &&
		(template.account === ANY || template.account === event.accountId) &&
		(template.period === ANY || template.period === period)
	);
}

function placeholderValue(name: string, format: string | undefined, event: AgendaEvent, moment: MomentFactory): string | undefined {
	const formatted = (date: Date, fallback: string) => moment(date.valueOf()).format(format?.trim() || fallback);
	switch (name) {
		case "title":
			return singleLine(event.title);
		case "account":
			return event.accountName;
		case "calendar":
			return event.calendar;
		case "start":
			return formatted(event.start, DEFAULT_TIME_FORMAT);
		case "end":
			return formatted(displayedEnd(event), DEFAULT_TIME_FORMAT);
		case "date":
			return formatted(event.start, DEFAULT_DATE_FORMAT);
		case "location":
			return singleLine(event.location);
		case "description":
			return singleLine(event.description);
		case "url":
			return event.url;
		case "organizer":
			return event.organizer;
		case "attendees":
			return event.attendees.join(", ");
		case "status":
			return event.status;
		default:
			return undefined;
	}
}

function displayedEnd(event: AgendaEvent): Date {
	if (!event.allDay) return event.end;
	const lastDay = new Date(event.end.valueOf());
	lastDay.setDate(lastDay.getDate() - 1);
	return lastDay.valueOf() > event.start.valueOf() ? lastDay : event.start;
}

function singleLine(text: string): string {
	return text.replace(/\s*[\r\n]+\s*/g, " ").trim();
}
