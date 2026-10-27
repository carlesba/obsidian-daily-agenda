import type { AgendaEvent, CalendarOrigin } from "./event.ts";
import { send } from "./http.ts";
import type { Http } from "./http.ts";
import { parseICalendar } from "./icalendar.ts";
import type { TimeRange } from "../periodic/periodicNote.ts";

export async function fetchIcsEvents(http: Http, url: string, range: TimeRange, origin: CalendarOrigin): Promise<AgendaEvent[]> {
	const response = await send(http, { url: httpUrl(url), method: "GET", headers: { Accept: "text/calendar" } });
	return parseICalendar(response.text, range, origin);
}

export function httpUrl(url: string): string {
	return url.trim().replace(/^webcals?:\/\//i, "https://");
}
