import type { AgendaEvent, CalendarOrigin } from "./event.ts";
import { CalendarError, basicAuthorization, send } from "./http.ts";
import type { Http } from "./http.ts";
import { parseICalendar } from "./icalendar.ts";
import { calendarHomeSet, calendarObjects, currentUserPrincipal, eventCalendars } from "./multistatus.ts";
import type { DavCalendar } from "./multistatus.ts";
import type { TimeRange } from "../periodic/periodicNote.ts";

export interface CalDavConnection {
	serverUrl: string;
	username: string;
	password: string;
}

const PRINCIPAL_QUERY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;

const HOME_SET_QUERY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;

const CALENDARS_QUERY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>`;

export function eventsQuery(range: TimeRange): string {
	return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${utcStamp(range.start)}" end="${utcStamp(range.end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
}

export async function fetchCalDavEvents(
	http: Http,
	connection: CalDavConnection,
	range: TimeRange,
	origin: CalendarOrigin,
): Promise<AgendaEvent[]> {
	const calendars = await discoverCalendars(http, connection);
	const perCalendar = await Promise.all(
		calendars.map(async (calendar) => {
			const objects = await davRequest(http, connection, "REPORT", calendar.url, "1", eventsQuery(range));
			return calendarObjects(objects.text).flatMap((data) =>
				parseICalendar(data, range, { ...origin, calendarName: calendar.name }),
			);
		}),
	);
	return perCalendar.flat();
}

export async function discoverCalendars(http: Http, connection: CalDavConnection): Promise<DavCalendar[]> {
	const principalResponse = await davRequest(http, connection, "PROPFIND", connection.serverUrl, "0", PRINCIPAL_QUERY);
	const principal = currentUserPrincipal(principalResponse.text, principalResponse.url);
	if (!principal) throw new CalendarError("noPrincipal");
	const homeResponse = await davRequest(http, connection, "PROPFIND", principal, "0", HOME_SET_QUERY);
	const home = calendarHomeSet(homeResponse.text, homeResponse.url);
	if (!home) throw new CalendarError("noCalendarHome");
	const calendarsResponse = await davRequest(http, connection, "PROPFIND", home, "1", CALENDARS_QUERY);
	return eventCalendars(calendarsResponse.text, calendarsResponse.url);
}

function davRequest(http: Http, connection: CalDavConnection, method: string, url: string, depth: string, body: string) {
	return send(http, {
		url,
		method,
		body,
		headers: {
			Authorization: basicAuthorization(connection.username, connection.password),
			Depth: depth,
			"Content-Type": "application/xml; charset=utf-8",
		},
	});
}

function utcStamp(date: Date): string {
	return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
