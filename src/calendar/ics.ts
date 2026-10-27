import type { AgendaEvent, CalendarOrigin } from "./event.ts";
import { CalendarError, send } from "./http.ts";
import type { Http } from "./http.ts";
import { parseICalendar } from "./icalendar.ts";
import type { TimeRange } from "../periodic/periodicNote.ts";

export async function fetchIcsEvents(http: Http, url: string, range: TimeRange, origin: CalendarOrigin): Promise<AgendaEvent[]> {
	const feedUrl = httpUrl(url);
	if (isGoogleShareLink(feedUrl)) throw new CalendarError("notICalFeed", undefined, feedUrl);
	const response = await send(http, { url: feedUrl, method: "GET", headers: { Accept: "text/calendar" } }).catch((error: unknown) => {
		if (error instanceof CalendarError && error.status === 404 && isGooglePublicAddress(feedUrl)) {
			throw new CalendarError("googlePublicAddress", 404, feedUrl);
		}
		throw error;
	});
	if (!/^\s*BEGIN:VCALENDAR/i.test(response.text)) throw new CalendarError("notICalFeed", response.status, feedUrl);
	return parseICalendar(response.text, range, origin);
}

function isGooglePublicAddress(url: string): boolean {
	try {
		const { host, pathname } = new URL(url);
		return host === "calendar.google.com" && /^\/calendar\/ical\/[^/]+\/public\//.test(pathname);
	} catch {
		return false;
	}
}

function isGoogleShareLink(url: string): boolean {
	try {
		const { host, pathname } = new URL(url);
		return host === "calendar.google.com" && !pathname.startsWith("/calendar/ical/");
	} catch {
		return false;
	}
}

export function httpUrl(url: string): string {
	return url.trim().replace(/^webcals?:\/\//i, "https://");
}
