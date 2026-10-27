import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fetchCalDavEvents } from "../src/calendar/caldav.ts";
import { CalendarError } from "../src/calendar/http.ts";
import type { HttpRequest, HttpResponse } from "../src/calendar/http.ts";
import { calendarHomeSet, calendarObjects, currentUserPrincipal, eventCalendars } from "../src/calendar/multistatus.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/caldav/${name}`, import.meta.url), "utf8");

const HOME = "https://p42-caldav.icloud.com:443/123456789/calendars/";

const week = { start: new Date("2025-03-10T00:00:00Z"), end: new Date("2025-03-17T00:00:00Z") };

test("the principal href is resolved against the server it came from", () => {
	assert.equal(currentUserPrincipal(fixture("principal.xml"), "https://caldav.icloud.com/"), "https://caldav.icloud.com/123456789/principal/");
});

test("an absolute calendar home on another host is kept as given", () => {
	assert.equal(
		calendarHomeSet(fixture("home-set.xml"), "https://caldav.icloud.com/123456789/principal/"),
		"https://p42-caldav.icloud.com/123456789/calendars/",
	);
});

test("only calendars that hold events are listed, named by their display name or path", () => {
	assert.deepEqual(eventCalendars(fixture("calendars.xml"), HOME), [
		{ url: "https://p42-caldav.icloud.com/123456789/calendars/home/", name: "Home & Family" },
		{ url: "https://p42-caldav.icloud.com/123456789/calendars/work%20shared/", name: "work shared" },
	]);
});

test("calendar data is read from CDATA sections and from entity-escaped text", () => {
	const [dentist, dinner] = calendarObjects(fixture("events.xml"));
	assert.match(dentist, /^BEGIN:VCALENDAR\nVERSION:2\.0/);
	assert.match(dentist, /SUMMARY:Dentist <check-up> & cleaning\n/);
	assert.match(dinner, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
	assert.match(dinner, /SUMMARY:Dinner at "Tom & Ana's" <home>\r\n/);
});

const server = (log: HttpRequest[]) => async (request: HttpRequest): Promise<HttpResponse> => {
	log.push(request);
	const respond = (name: string): HttpResponse => ({ status: 207, headers: {}, text: fixture(name) });
	if (request.url === "https://caldav.icloud.com/") return { status: 301, headers: { Location: "/discover/" }, text: "" };
	if (request.url === "https://caldav.icloud.com/discover/") return respond("principal.xml");
	if (request.url === "https://caldav.icloud.com/123456789/principal/") return respond("home-set.xml");
	if (request.url === "https://p42-caldav.icloud.com/123456789/calendars/") return respond("calendars.xml");
	if (request.url.endsWith("/home/")) return respond("events.xml");
	if (request.url.endsWith("/work%20shared/")) return { status: 207, headers: {}, text: '<multistatus xmlns="DAV:"/>' };
	return { status: 404, headers: {}, text: "" };
};

test("events are discovered through the principal, the calendar home and each event calendar", async () => {
	const log: HttpRequest[] = [];
	const connection = { serverUrl: "https://caldav.icloud.com/", username: "someone@example.com", password: "abcd-efgh" };
	const events = await fetchCalDavEvents(server(log), connection, week, { accountId: "home", accountName: "Personal" });
	assert.deepEqual(
		events.map((event) => [event.title, event.calendar, event.accountName]),
		[
			["Dentist <check-up> & cleaning", "Home & Family", "Personal"],
			['Dinner at "Tom & Ana\'s" <home>', "Home & Family", "Personal"],
		],
	);
	assert.deepEqual(
		log.map((request) => [request.method, request.headers.Depth]),
		[["PROPFIND", "0"], ["PROPFIND", "0"], ["PROPFIND", "0"], ["PROPFIND", "1"], ["REPORT", "1"], ["REPORT", "1"]],
	);
	assert.equal(log[0].headers.Authorization, `Basic ${Buffer.from("someone@example.com:abcd-efgh").toString("base64")}`);
	assert.match(log[4].body ?? "", /<c:time-range start="20250310T000000Z" end="20250317T000000Z"\/>/);
});

test("a rejected password fails as an authentication error", async () => {
	const connection = { serverUrl: "https://caldav.icloud.com/", username: "someone@example.com", password: "wrong" };
	const unauthorised = async (): Promise<HttpResponse> => ({ status: 401, headers: {}, text: "" });
	await assert.rejects(
		fetchCalDavEvents(unauthorised, connection, week, { accountId: "home", accountName: "Personal" }),
		(error: unknown) => error instanceof CalendarError && error.reason === "authenticationFailed",
	);
});
