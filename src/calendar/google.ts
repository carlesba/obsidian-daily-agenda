import type { AccountCalendar } from "../settings.ts";
import type { AgendaEvent, CalendarOrigin } from "./event.ts";
import { GOOGLE_REDIRECT_URI } from "./googleAuth.ts";
import { CalendarError, send } from "./http.ts";
import type { Http } from "./http.ts";
import type { TimeRange } from "../periodic/periodicNote.ts";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

const EXPIRY_MARGIN_MS = 60 * 1000;

const MAX_RESULTS = "2500";

export interface GoogleClient {
	clientId: string;
	clientSecret: string;
}

export interface AccessToken {
	accessToken: string;
	expiresAt: number;
}

export interface GrantedTokens extends AccessToken {
	refreshToken: string;
}

export type AccessTokens = Map<string, AccessToken>;

export interface GoogleConnection extends GoogleClient {
	accountId: string;
	refreshToken: string;
	calendars: readonly AccountCalendar[];
}

export interface CalendarListing {
	email: string;
	calendars: AccountCalendar[];
}

type Json = Record<string, unknown>;

export async function exchangeCode(http: Http, client: GoogleClient, code: string, verifier: string, now = Date.now()): Promise<GrantedTokens> {
	const granted = await postToken(http, {
		grant_type: "authorization_code",
		code,
		client_id: client.clientId,
		client_secret: client.clientSecret,
		redirect_uri: GOOGLE_REDIRECT_URI,
		code_verifier: verifier,
	});
	const refreshToken = text(granted.refresh_token);
	if (!refreshToken) throw new CalendarError("signedOut");
	return { ...accessTokenFrom(granted, now), refreshToken };
}

export async function refreshAccessToken(http: Http, client: GoogleClient, refreshToken: string, now = Date.now()): Promise<AccessToken> {
	const granted = await postToken(http, {
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		client_id: client.clientId,
		client_secret: client.clientSecret,
	});
	return accessTokenFrom(granted, now);
}

export async function validAccessToken(http: Http, connection: GoogleConnection, tokens: AccessTokens, now = Date.now()): Promise<string> {
	const cached = tokens.get(connection.accountId);
	if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > now) return cached.accessToken;
	const fresh = await refreshAccessToken(http, connection, connection.refreshToken, now);
	tokens.set(connection.accountId, fresh);
	return fresh.accessToken;
}

export async function listCalendars(http: Http, accessToken: string, known: readonly AccountCalendar[] = []): Promise<CalendarListing> {
	const items = await pagedItems(http, accessToken, `${GOOGLE_CALENDAR_API}/users/me/calendarList`, {});
	const enabledBefore = new Map(known.map((calendar) => [calendar.id, calendar.enabled]));
	const listing: CalendarListing = { email: "", calendars: [] };
	for (const item of items) {
		const id = text(item.id);
		if (!id) continue;
		if (item.primary === true) listing.email = id;
		listing.calendars.push({
			id,
			name: text(item.summaryOverride) ?? text(item.summary) ?? id,
			enabled: enabledBefore.get(id) ?? (item.primary === true || item.selected === true),
		});
	}
	return listing;
}

export async function fetchGoogleEvents(
	http: Http,
	connection: GoogleConnection,
	tokens: AccessTokens,
	range: TimeRange,
	origin: CalendarOrigin,
): Promise<AgendaEvent[]> {
	const accessToken = await validAccessToken(http, connection, tokens);
	try {
		const perCalendar = await Promise.all(
			connection.calendars
				.filter((calendar) => calendar.enabled)
				.map(async (calendar) => {
					const items = await pagedItems(http, accessToken, `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendar.id)}/events`, {
						singleEvents: "true",
						orderBy: "startTime",
						timeMin: range.start.toISOString(),
						timeMax: range.end.toISOString(),
						maxResults: MAX_RESULTS,
					});
					return items.flatMap((item) => googleEvent(item, range, { ...origin, calendarName: calendar.name }) ?? []);
				}),
		);
		return perCalendar.flat();
	} catch (error) {
		if (error instanceof CalendarError && error.reason === "authenticationFailed") tokens.delete(connection.accountId);
		throw error;
	}
}

export function googleEvent(item: Json, range: TimeRange, origin: CalendarOrigin): AgendaEvent | undefined {
	const status = text(item.status) ?? "";
	if (status.toLowerCase() === "cancelled") return undefined;
	const start = eventTime(item.start);
	const end = eventTime(item.end) ?? start;
	if (!start || !end || !overlaps(start.date, end.date, range)) return undefined;
	return {
		accountId: origin.accountId,
		accountName: origin.accountName,
		calendar: origin.calendarName ?? origin.accountName,
		title: text(item.summary) ?? "",
		start: start.date,
		end: end.date,
		allDay: start.allDay,
		location: text(item.location) ?? "",
		description: text(item.description) ?? "",
		url: text(item.htmlLink) ?? "",
		organizer: personName(item.organizer) ?? "",
		attendees: (Array.isArray(item.attendees) ? item.attendees : [])
			.filter((attendee) => !(isJson(attendee) && attendee.resource === true))
			.flatMap((attendee) => personName(attendee) ?? []),
		status: status.toUpperCase(),
	};
}

async function postToken(http: Http, fields: Record<string, string>): Promise<Json> {
	const response = await http({
		url: GOOGLE_TOKEN_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
		body: new URLSearchParams(fields).toString(),
	});
	const body = parseJson(response.text);
	if (response.status >= 200 && response.status < 300 && text(body.access_token)) return body;
	if (body.error === "invalid_grant") throw new CalendarError("signedOut");
	if (response.status === 401 || response.status === 403) throw new CalendarError("authenticationFailed", response.status, GOOGLE_TOKEN_URL);
	throw new CalendarError("requestFailed", response.status, GOOGLE_TOKEN_URL);
}

function accessTokenFrom(granted: Json, now: number): AccessToken {
	const lifetime = typeof granted.expires_in === "number" ? granted.expires_in : Number(granted.expires_in);
	return { accessToken: text(granted.access_token) ?? "", expiresAt: now + (Number.isFinite(lifetime) ? lifetime : 0) * 1000 };
}

async function pagedItems(http: Http, accessToken: string, url: string, query: Record<string, string>): Promise<Json[]> {
	const items: Json[] = [];
	let pageToken: string | undefined;
	do {
		const parameters = new URLSearchParams(query);
		if (pageToken) parameters.set("pageToken", pageToken);
		const search = parameters.toString();
		const response = await send(http, {
			url: search === "" ? url : `${url}?${search}`,
			method: "GET",
			headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
		});
		const page = parseJson(response.text);
		if (Array.isArray(page.items)) items.push(...page.items.filter(isJson));
		pageToken = text(page.nextPageToken);
	} while (pageToken);
	return items;
}

function eventTime(value: unknown): { date: Date; allDay: boolean } | undefined {
	if (!isJson(value)) return undefined;
	const dateTime = text(value.dateTime);
	if (dateTime) {
		const date = new Date(dateTime);
		return Number.isNaN(date.valueOf()) ? undefined : { date, allDay: false };
	}
	const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value.date) ?? "");
	if (!day) return undefined;
	return { date: new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])), allDay: true };
}

function overlaps(start: Date, end: Date, range: TimeRange): boolean {
	const startTime = start.valueOf();
	const endTime = Math.max(end.valueOf(), startTime);
	if (endTime === startTime) return startTime >= range.start.valueOf() && startTime < range.end.valueOf();
	return startTime < range.end.valueOf() && endTime > range.start.valueOf();
}

function personName(value: unknown): string | undefined {
	if (!isJson(value)) return undefined;
	return text(value.displayName) ?? text(value.email);
}

function parseJson(body: string): Json {
	try {
		const parsed: unknown = JSON.parse(body);
		return isJson(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function text(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

function isJson(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
