import { ICLOUD_SERVER_URL } from "../settings.ts";
import type { Account } from "../settings.ts";
import type { TimeRange } from "../periodic/periodicNote.ts";
import { fetchCalDavEvents } from "./caldav.ts";
import type { CalDavConnection } from "./caldav.ts";
import type { AgendaEvent } from "./event.ts";
import { fetchGoogleEvents } from "./google.ts";
import type { AccessTokens, GoogleClient, GoogleConnection } from "./google.ts";
import { CalendarError } from "./http.ts";
import type { Http } from "./http.ts";
import { fetchIcsEvents } from "./ics.ts";

export type ReadSecret = (id: string) => string | null;

export type CalendarSource =
	| { type: "caldav"; connection: CalDavConnection }
	| { type: "ics"; url: string }
	| { type: "google"; connection: GoogleConnection };

export interface AccountFailure {
	account: Account;
	error: unknown;
}

export interface AgendaFetch {
	events: AgendaEvent[];
	failures: AccountFailure[];
}

export function calendarSource(account: Account, readSecret: ReadSecret): CalendarSource {
	if (account.kind === "ics") {
		const url = secret(account.urlSecret, readSecret);
		if (!url) throw new CalendarError("missingCredentials");
		return { type: "ics", url };
	}
	if (account.kind === "google") return { type: "google", connection: googleConnection(account, readSecret) };
	const password = secret(account.passwordSecret, readSecret);
	const username = account.username.trim();
	if (!password || username === "") throw new CalendarError("missingCredentials");
	return { type: "caldav", connection: { serverUrl: account.serverUrl.trim() || ICLOUD_SERVER_URL, username, password } };
}

export function googleClient(account: Account, readSecret: ReadSecret): GoogleClient {
	const clientId = account.clientId.trim();
	const clientSecret = secret(account.clientSecret, readSecret);
	if (clientId === "" || !clientSecret) throw new CalendarError("missingCredentials");
	return { clientId, clientSecret };
}

export function googleConnection(account: Account, readSecret: ReadSecret): GoogleConnection {
	const client = googleClient(account, readSecret);
	const refreshToken = secret(account.tokenSecret, readSecret);
	if (!refreshToken) throw new CalendarError("signedOut");
	return { ...client, accountId: account.id, refreshToken, calendars: account.calendars };
}

export async function fetchAccountEvents(
	http: Http,
	account: Account,
	readSecret: ReadSecret,
	range: TimeRange,
	tokens: AccessTokens = new Map(),
): Promise<AgendaEvent[]> {
	const source = calendarSource(account, readSecret);
	const origin = { accountId: account.id, accountName: accountName(account) };
	if (source.type === "ics") return fetchIcsEvents(http, source.url, range, origin);
	if (source.type === "google") return fetchGoogleEvents(http, source.connection, tokens, range, origin);
	return fetchCalDavEvents(http, source.connection, range, origin);
}

export async function fetchAgenda(
	http: Http,
	accounts: readonly Account[],
	readSecret: ReadSecret,
	range: TimeRange,
	tokens: AccessTokens = new Map(),
): Promise<AgendaFetch> {
	const enabled = accounts.filter((account) => account.enabled);
	const results = await Promise.allSettled(enabled.map((account) => fetchAccountEvents(http, account, readSecret, range, tokens)));
	const fetched: AgendaFetch = { events: [], failures: [] };
	results.forEach((result, index) => {
		if (result.status === "fulfilled") fetched.events.push(...result.value);
		else fetched.failures.push({ account: enabled[index], error: result.reason });
	});
	return fetched;
}

export function accountName(account: Account): string {
	return account.name.trim() || account.id;
}

function secret(id: string, readSecret: ReadSecret): string | undefined {
	if (id.trim() === "") return undefined;
	const value = readSecret(id.trim())?.trim();
	return value ? value : undefined;
}
