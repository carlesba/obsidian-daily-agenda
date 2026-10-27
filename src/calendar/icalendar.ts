import ICAL from "ical.js";
import type { AgendaEvent, CalendarOrigin } from "./event.ts";
import type { TimeRange } from "../periodic/periodicNote.ts";

type Component = InstanceType<typeof ICAL.Component>;
type CalendarEvent = InstanceType<typeof ICAL.Event>;
type Time = InstanceType<typeof ICAL.Time>;
type Property = InstanceType<typeof ICAL.Property>;

const MAX_OCCURRENCES = 50000;

export function parseICalendar(text: string, range: TimeRange, origin: CalendarOrigin): AgendaEvent[] {
	return calendarRoots(text).flatMap((root) => calendarEvents(root, range, origin));
}

function calendarRoots(text: string): Component[] {
	const parsed: unknown = ICAL.parse(text);
	const roots = Array.isArray(parsed) && Array.isArray(parsed[0]) ? (parsed as unknown[]) : [parsed];
	return roots.map((jCal) => new ICAL.Component(jCal as ConstructorParameters<typeof ICAL.Component>[0]));
}

function calendarEvents(root: Component, range: TimeRange, origin: CalendarOrigin): AgendaEvent[] {
	for (const timezone of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(timezone);
	const calendarName = origin.calendarName ?? textValue(root, "x-wr-calname") ?? origin.accountName;
	const describe = (item: CalendarEvent, start: Time, end: Time) => agendaEvent(item, start, end, { ...origin, calendarName });
	const masters = new Map<string, CalendarEvent>();
	const exceptions: CalendarEvent[] = [];
	for (const component of root.getAllSubcomponents("vevent")) {
		const event = new ICAL.Event(component);
		if (event.isRecurrenceException()) exceptions.push(event);
		else masters.set(event.uid, event);
	}
	const orphans: CalendarEvent[] = [];
	for (const exception of exceptions) {
		const master = masters.get(exception.uid);
		if (master) master.relateException(exception);
		else orphans.push(exception);
	}
	const events: AgendaEvent[] = [];
	for (const master of masters.values()) {
		if (master.isRecurring()) events.push(...occurrences(master, range, describe));
		else if (overlaps(master.startDate, master.endDate, range) && !isCancelled(master)) {
			events.push(describe(master, master.startDate, master.endDate));
		}
	}
	for (const orphan of orphans) {
		if (overlaps(orphan.startDate, orphan.endDate, range) && !isCancelled(orphan)) {
			events.push(describe(orphan, orphan.startDate, orphan.endDate));
		}
	}
	return events;
}

function occurrences(
	master: CalendarEvent,
	range: TimeRange,
	describe: (item: CalendarEvent, start: Time, end: Time) => AgendaEvent,
): AgendaEvent[] {
	if (isCancelled(master)) return [];
	const lastMoved = Object.values(master.exceptions).reduce(
		(latest, exception) => Math.max(latest, exception.recurrenceId.toJSDate().valueOf()),
		Number.NEGATIVE_INFINITY,
	);
	const events: AgendaEvent[] = [];
	const expansion = master.iterator();
	for (let count = 0; count < MAX_OCCURRENCES; count++) {
		const occurrence = expansion.next();
		if (!occurrence) break;
		const occurrenceTime = occurrence.toJSDate().valueOf();
		if (occurrenceTime >= range.end.valueOf() && occurrenceTime > lastMoved) break;
		const details = master.getOccurrenceDetails(occurrence);
		if (!overlaps(details.startDate, details.endDate, range) || isCancelled(details.item)) continue;
		events.push(describe(details.item, details.startDate, details.endDate));
	}
	return events;
}

function overlaps(start: Time, end: Time, range: TimeRange): boolean {
	const startTime = start.toJSDate().valueOf();
	const endTime = Math.max(end.toJSDate().valueOf(), startTime);
	const rangeStart = range.start.valueOf();
	const rangeEnd = range.end.valueOf();
	if (endTime === startTime) return startTime >= rangeStart && startTime < rangeEnd;
	return startTime < rangeEnd && endTime > rangeStart;
}

function isCancelled(event: CalendarEvent): boolean {
	return textValue(event.component, "status")?.toUpperCase() === "CANCELLED";
}

function agendaEvent(item: CalendarEvent, start: Time, end: Time, origin: Required<CalendarOrigin>): AgendaEvent {
	const { component } = item;
	return {
		accountId: origin.accountId,
		accountName: origin.accountName,
		calendar: origin.calendarName,
		title: item.summary ?? "",
		start: start.toJSDate(),
		end: end.toJSDate(),
		allDay: start.isDate,
		location: item.location ?? "",
		description: item.description ?? "",
		url: textValue(component, "url") ?? "",
		organizer: personName(component.getFirstProperty("organizer")) ?? "",
		attendees: component.getAllProperties("attendee").flatMap((attendee) => personName(attendee) ?? []),
		status: textValue(component, "status") ?? "",
	};
}

function personName(property: Property | null): string | undefined {
	if (!property) return undefined;
	const commonName = property.getParameter("cn");
	if (typeof commonName === "string" && commonName.trim() !== "") return commonName.trim();
	const address = property.getFirstValue();
	if (typeof address !== "string") return undefined;
	const email = address.replace(/^mailto:/i, "").trim();
	return email === "" ? undefined : email;
}

function textValue(component: Component, name: string): string | undefined {
	const value = component.getFirstPropertyValue(name);
	if (value === null || value === undefined) return undefined;
	const text = String(value).trim();
	return text === "" ? undefined : text;
}
