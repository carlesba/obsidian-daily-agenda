import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fetchAgenda } from "../src/calendar/accounts.ts";
import { CalendarError } from "../src/calendar/http.ts";
import type { HttpRequest, HttpResponse } from "../src/calendar/http.ts";
import { newAccount } from "../src/settings.ts";
import type { Account } from "../src/settings.ts";

const ics = readFileSync(new URL("./fixtures/calendar.ics", import.meta.url), "utf8");

const march = { start: new Date(2025, 2, 1), end: new Date(2025, 3, 1) };

const secrets: Record<string, string> = {
	"team-ics": "webcal://calendar.example.com/team.ics",
	"broken-ics": "https://calendar.example.com/missing.ics",
};

const icsAccount = (id: string, name: string, urlSecret: string): Account => ({ ...newAccount([], "ics"), id, name, urlSecret });

const http = (log: string[]) => async (request: HttpRequest): Promise<HttpResponse> => {
	log.push(request.url);
	if (request.url === "https://calendar.example.com/team.ics") return { status: 200, headers: {}, text: ics };
	return { status: 404, headers: {}, text: "" };
};

test("a failing account is reported while the others still bring their events", async () => {
	const log: string[] = [];
	const accounts = [
		icsAccount("team", "Team", "team-ics"),
		icsAccount("broken", "Broken", "broken-ics"),
		icsAccount("unset", "Unset", ""),
		{ ...icsAccount("off", "Off", "team-ics"), enabled: false },
	];
	const { events, failures } = await fetchAgenda(http(log), accounts, (id) => secrets[id] ?? null, march);
	assert.ok(events.length > 0);
	assert.ok(events.every((event) => event.accountName === "Team"));
	assert.deepEqual(
		failures.map(({ account, error }) => [account.name, error instanceof CalendarError ? error.reason : error]),
		[
			["Broken", "requestFailed"],
			["Unset", "missingCredentials"],
		],
	);
	assert.deepEqual(log, ["https://calendar.example.com/team.ics", "https://calendar.example.com/missing.ics"]);
});

test("an iCloud account needs its Apple ID and password before any request", async () => {
	const log: string[] = [];
	const account = { ...newAccount([]), name: "Personal", username: "someone@example.com", passwordSecret: "missing" };
	const { failures } = await fetchAgenda(http(log), [account], () => null, march);
	assert.equal(failures.length, 1);
	assert.deepEqual(log, []);
});
