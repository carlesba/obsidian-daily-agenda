import { test } from "node:test";
import { strict as assert } from "node:assert";
import { fetchAgenda } from "../src/calendar/accounts.ts";
import { exchangeCode, fetchGoogleEvents, listCalendars, refreshAccessToken, validAccessToken } from "../src/calendar/google.ts";
import type { AccessTokens, GoogleConnection } from "../src/calendar/google.ts";
import { GOOGLE_REDIRECT_URI } from "../src/calendar/googleAuth.ts";
import { CalendarError } from "../src/calendar/http.ts";
import type { HttpRequest, HttpResponse } from "../src/calendar/http.ts";
import { newAccount } from "../src/settings.ts";

const client = { clientId: "client.apps.googleusercontent.com", clientSecret: "client-secret" };

const json = (body: unknown, status = 200): HttpResponse => ({ status, headers: {}, text: JSON.stringify(body) });

const recording = (respond: (request: HttpRequest) => HttpResponse) => {
	const requests: HttpRequest[] = [];
	const http = async (request: HttpRequest) => {
		requests.push(request);
		return respond(request);
	};
	return { http, requests };
};

const form = (request: HttpRequest) => Object.fromEntries(new URLSearchParams(request.body ?? ""));

const week = { start: new Date(2025, 2, 10), end: new Date(2025, 2, 17) };

const connection = (overrides: Partial<GoogleConnection> = {}): GoogleConnection => ({
	...client,
	accountId: "account-1",
	refreshToken: "refresh-1",
	calendars: [{ id: "someone@example.com", name: "Personal", enabled: true }],
	...overrides,
});

test("the authorization code is exchanged with the PKCE verifier", async () => {
	const { http, requests } = recording(() => json({ access_token: "access-1", expires_in: 3599, refresh_token: "refresh-1" }));
	const granted = await exchangeCode(http, client, "4/code", "verifier-1", 1000);
	assert.deepEqual(granted, { accessToken: "access-1", expiresAt: 1000 + 3599000, refreshToken: "refresh-1" });
	assert.equal(requests[0].url, "https://oauth2.googleapis.com/token");
	assert.equal(requests[0].method, "POST");
	assert.equal(requests[0].headers["Content-Type"], "application/x-www-form-urlencoded");
	assert.deepEqual(form(requests[0]), {
		grant_type: "authorization_code",
		code: "4/code",
		client_id: client.clientId,
		client_secret: client.clientSecret,
		redirect_uri: GOOGLE_REDIRECT_URI,
		code_verifier: "verifier-1",
	});
});

test("an access token is refreshed with the stored refresh token", async () => {
	const { http, requests } = recording(() => json({ access_token: "access-2", expires_in: 3600 }));
	assert.deepEqual(await refreshAccessToken(http, client, "refresh-1", 0), { accessToken: "access-2", expiresAt: 3600000 });
	assert.deepEqual(form(requests[0]), {
		grant_type: "refresh_token",
		refresh_token: "refresh-1",
		client_id: client.clientId,
		client_secret: client.clientSecret,
	});
});

test("a cached access token is reused until it is about to expire", async () => {
	const { http, requests } = recording(() => json({ access_token: "fresh", expires_in: 3600 }));
	const tokens: AccessTokens = new Map([["account-1", { accessToken: "cached", expiresAt: 100000 }]]);
	assert.equal(await validAccessToken(http, connection(), tokens, 39999), "cached");
	assert.equal(requests.length, 0);
	assert.equal(await validAccessToken(http, connection(), tokens, 40000), "fresh");
	assert.equal(requests.length, 1);
	assert.equal(tokens.get("account-1")?.accessToken, "fresh");
});

test("a revoked refresh token means the account is signed out", async () => {
	const { http } = recording(() => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));
	await assert.rejects(refreshAccessToken(http, client, "refresh-1"), (error) => error instanceof CalendarError && error.reason === "signedOut");
});

test("a rejected client is an authentication failure at Google's token host", async () => {
	const { http } = recording(() => json({ error: "invalid_client" }, 401));
	await assert.rejects(
		refreshAccessToken(http, client, "refresh-1"),
		(error) => error instanceof CalendarError && error.reason === "authenticationFailed" && error.url === "https://oauth2.googleapis.com/token",
	);
});

test("calendars are named by their override and enabled when primary or shown", async () => {
	const { http, requests } = recording(() =>
		json({
			items: [
				{ id: "someone@example.com", summary: "someone@example.com", summaryOverride: "Personal", primary: true },
				{ id: "team@group.calendar.google.com", summary: "Team", selected: true },
				{ id: "holidays@group.v.calendar.google.com", summary: "Holidays" },
			],
		}),
	);
	const listing = await listCalendars(http, "access-1", [{ id: "team@group.calendar.google.com", name: "Team", enabled: false }]);
	assert.deepEqual(listing, {
		email: "someone@example.com",
		calendars: [
			{ id: "someone@example.com", name: "Personal", enabled: true },
			{ id: "team@group.calendar.google.com", name: "Team", enabled: false },
			{ id: "holidays@group.v.calendar.google.com", name: "Holidays", enabled: false },
		],
	});
	assert.equal(requests[0].url, "https://www.googleapis.com/calendar/v3/users/me/calendarList");
	assert.equal(requests[0].headers.Authorization, "Bearer access-1");
});

const firstPage = {
	items: [
		{
			status: "confirmed",
			summary: "Planning",
			start: { dateTime: "2025-03-14T09:30:00+01:00" },
			end: { dateTime: "2025-03-14T10:15:00+01:00" },
			location: "Room 1",
			description: "Agenda",
			htmlLink: "https://www.google.com/calendar/event?eid=abc",
			organizer: { email: "lead@example.com", displayName: "Lead" },
			attendees: [
				{ email: "lead@example.com", displayName: "Lead" },
				{ email: "guest@example.com" },
				{ email: "room@resource.calendar.google.com", displayName: "Room 1", resource: true },
			],
		},
		{ status: "cancelled", summary: "Dropped", start: { dateTime: "2025-03-12T09:00:00Z" }, end: { dateTime: "2025-03-12T10:00:00Z" } },
	],
	nextPageToken: "page-2",
};

const secondPage = {
	items: [{ status: "tentative", summary: "Holiday", start: { date: "2025-03-11" }, end: { date: "2025-03-13" }, organizer: { email: "someone@example.com" } }],
};

test("events are read across pages and mapped like iCalendar events", async () => {
	const { http, requests } = recording((request) => {
		if (request.url.startsWith("https://oauth2")) return json({ access_token: "access-1", expires_in: 3600 });
		return json(new URL(request.url).searchParams.get("pageToken") === "page-2" ? secondPage : firstPage);
	});
	const events = await fetchGoogleEvents(http, connection(), new Map(), week, { accountId: "account-1", accountName: "Google" });
	assert.deepEqual(events, [
		{
			accountId: "account-1",
			accountName: "Google",
			calendar: "Personal",
			title: "Planning",
			start: new Date("2025-03-14T08:30:00Z"),
			end: new Date("2025-03-14T09:15:00Z"),
			allDay: false,
			location: "Room 1",
			description: "Agenda",
			url: "https://www.google.com/calendar/event?eid=abc",
			organizer: "Lead",
			attendees: ["Lead", "guest@example.com"],
			status: "CONFIRMED",
		},
		{
			accountId: "account-1",
			accountName: "Google",
			calendar: "Personal",
			title: "Holiday",
			start: new Date(2025, 2, 11),
			end: new Date(2025, 2, 13),
			allDay: true,
			location: "",
			description: "",
			url: "",
			organizer: "someone@example.com",
			attendees: [],
			status: "TENTATIVE",
		},
	]);
	const pages = requests.filter((request) => request.url.includes("/events")).map((request) => new URL(request.url));
	assert.equal(pages.length, 2);
	assert.equal(pages[0].pathname, "/calendar/v3/calendars/someone%40example.com/events");
	assert.deepEqual(Object.fromEntries(pages[0].searchParams), {
		singleEvents: "true",
		orderBy: "startTime",
		timeMin: week.start.toISOString(),
		timeMax: week.end.toISOString(),
		maxResults: "2500",
	});
	assert.equal(pages[1].searchParams.get("pageToken"), "page-2");
	assert.ok(requests.filter((request) => request.url.includes("/events")).every((request) => request.headers.Authorization === "Bearer access-1"));
});

test("disabled calendars are not read and a rejected token is an authentication failure", async () => {
	const { http, requests } = recording((request) => (request.url.startsWith("https://oauth2") ? json({ access_token: "access-1", expires_in: 3600 }) : json({}, 401)));
	const tokens: AccessTokens = new Map();
	const calendars = [
		{ id: "someone@example.com", name: "Personal", enabled: true },
		{ id: "off@example.com", name: "Off", enabled: false },
	];
	await assert.rejects(
		fetchGoogleEvents(http, connection({ calendars }), tokens, week, { accountId: "account-1", accountName: "Google" }),
		(error) => error instanceof CalendarError && error.reason === "authenticationFailed" && error.status === 401 && new URL(error.url ?? "").host === "www.googleapis.com",
	);
	assert.ok(!requests.some((request) => request.url.includes("off%40example.com")));
	assert.equal(tokens.size, 0);
});

test("a Google account without a refresh token is reported as signed out", async () => {
	const { http, requests } = recording(() => json({}));
	const account = { ...newAccount([], "google"), name: "Google", clientId: "client", clientSecret: "client-secret-id" };
	const secrets: Record<string, string> = { "client-secret-id": "secret" };
	const { failures } = await fetchAgenda(http, [account], (id) => secrets[id] ?? null, week);
	assert.deepEqual(failures.map(({ error }) => (error instanceof CalendarError ? error.reason : error)), ["signedOut"]);
	assert.equal(requests.length, 0);
});
