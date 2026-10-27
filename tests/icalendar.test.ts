import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { parseICalendar } from "../src/calendar/icalendar.ts";

const fixture = readFileSync(new URL("./fixtures/calendar.ics", import.meta.url), "utf8");

const march = { start: new Date(2025, 2, 1), end: new Date(2025, 3, 1) };

const origin = { accountId: "work", accountName: "Work" };

const events = () => parseICalendar(fixture, march, origin);

const byTitle = (title: string) => {
	const found = events().filter((event) => event.title === title);
	assert.equal(found.length, 1, `one "${title}" event`);
	return found[0];
};

test("a weekly event expands within the period, skipping its excluded date and moving its overrides", () => {
	const standups = events()
		.filter((event) => event.title.startsWith("Standup"))
		.sort((a, b) => a.start.valueOf() - b.start.valueOf())
		.map((event) => [event.title, event.start.toISOString(), event.end.toISOString(), event.location]);
	assert.deepEqual(standups, [
		["Standup", "2025-03-03T09:00:00.000Z", "2025-03-03T09:15:00.000Z", "Room 1"],
		["Standup", "2025-03-10T09:00:00.000Z", "2025-03-10T09:15:00.000Z", "Room 1"],
		["Standup (moved)", "2025-03-25T10:00:00.000Z", "2025-03-25T10:15:00.000Z", "Room 2"],
		["Standup (brought forward)", "2025-03-28T11:00:00.000Z", "2025-03-28T11:15:00.000Z", ""],
		["Standup", "2025-03-31T08:00:00.000Z", "2025-03-31T08:15:00.000Z", "Room 1"],
	]);
});

test("an event in a named time zone keeps its absolute time and its people", () => {
	const review = byTitle("Design review");
	assert.equal(review.start.toISOString(), "2025-03-12T13:00:00.000Z");
	assert.equal(review.end.toISOString(), "2025-03-12T14:00:00.000Z");
	assert.equal(review.allDay, false);
	assert.equal(review.organizer, "Alex Doe");
	assert.deepEqual(review.attendees, ["Sam Roe", "kim@example.com"]);
	assert.equal(review.url, "https://example.com/review");
	assert.equal(review.status, "CONFIRMED");
	assert.equal(review.description, "Agenda:\n1. Mockups\n2. Questions");
});

test("an all-day event spans local midnights", () => {
	const holiday = byTitle("Company holiday");
	assert.equal(holiday.allDay, true);
	assert.deepEqual(holiday.start, new Date(2025, 2, 14));
	assert.deepEqual(holiday.end, new Date(2025, 2, 15));
});

test("cancelled events and events outside the period are left out", () => {
	const titles = events().map((event) => event.title);
	assert.ok(!titles.includes("Cancelled sync"));
	assert.ok(!titles.includes("Last month"));
});

test("events carry the account and the calendar's name", () => {
	const review = byTitle("Design review");
	assert.equal(review.accountId, "work");
	assert.equal(review.accountName, "Work");
	assert.equal(review.calendar, "Team calendar");
	const named = parseICalendar(fixture, march, { ...origin, calendarName: "Shared" });
	assert.ok(named.every((event) => event.calendar === "Shared"));
});

test("a calendar without a name is named after its account", () => {
	const unnamed = fixture.replace("X-WR-CALNAME:Team calendar\n", "");
	assert.ok(parseICalendar(unnamed, march, origin).every((event) => event.calendar === "Work"));
});

test("a period between occurrences gets none of them", () => {
	const quietDay = { start: new Date(2025, 2, 4), end: new Date(2025, 2, 5) };
	assert.deepEqual(parseICalendar(fixture, quietDay, origin), []);
});
