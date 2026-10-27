import { test } from "node:test";
import { strict as assert } from "node:assert";
import { matchingTemplate, renderTemplate } from "../src/agenda/template.ts";
import { ANY, DEFAULT_ALL_DAY_TEMPLATE, DEFAULT_TIMED_TEMPLATE, defaultSettings } from "../src/settings.ts";
import type { AgendaTemplate } from "../src/settings.ts";
import { event } from "./events.ts";
import { moment } from "./moment.ts";

const template = (overrides: Partial<AgendaTemplate>): AgendaTemplate => ({
	id: "t",
	enabled: true,
	account: ANY,
	period: ANY,
	kind: "timed",
	body: "",
	...overrides,
});

test("the default templates render timed and all-day events", () => {
	assert.equal(renderTemplate(DEFAULT_TIMED_TEMPLATE, event(), moment), "- [ ] 🗓️ **09:30**–**10:15** (Work) Planning");
	assert.equal(
		renderTemplate(DEFAULT_ALL_DAY_TEMPLATE, event({ allDay: true, title: "Offsite" }), moment),
		"- [ ] 🗓️ (Work) Offsite",
	);
});

test("every placeholder renders its event field", () => {
	const detailed = event({
		location: "Room 1",
		description: "Bring\nthe numbers\r\n  please",
		url: "https://example.com",
		organizer: "Alex Doe",
		attendees: ["Sam Roe", "kim@example.com"],
		status: "CONFIRMED",
	});
	const body =
		"{{title}}|{{account}}|{{calendar}}|{{start}}|{{end}}|{{date}}|{{location}}|{{description}}|{{url}}|{{organizer}}|{{attendees}}|{{status}}";
	assert.equal(
		renderTemplate(body, detailed, moment),
		"Planning|Work|Team|09:30|10:15|2025-03-14|Room 1|Bring the numbers please|https://example.com|Alex Doe|Sam Roe, kim@example.com|CONFIRMED",
	);
});

test("start, end and date take a moment format", () => {
	assert.equal(renderTemplate("{{date:ddd D MMM}} {{start:h:mm a}}-{{end:h:mm a}}", event(), moment), "Fri 14 Mar 9:30 am-10:15 am");
});

test("an all-day event's end is its last day", () => {
	const twoDays = event({ allDay: true, start: new Date(2025, 2, 14), end: new Date(2025, 2, 16) });
	assert.equal(renderTemplate("{{date}} to {{end:YYYY-MM-DD}}", twoDays, moment), "2025-03-14 to 2025-03-15");
	const oneDay = event({ allDay: true, start: new Date(2025, 2, 14), end: new Date(2025, 2, 15) });
	assert.equal(renderTemplate("{{end:YYYY-MM-DD}}", oneDay, moment), "2025-03-14");
});

test("unknown placeholders and empty fields stay as typed or empty", () => {
	assert.equal(renderTemplate("{{title}} {{room}} {{ location }}.", event(), moment), "Planning {{room}} .");
});

test("the most specific matching template wins and ties go to the earliest", () => {
	const templates = [
		template({ id: "any" }),
		template({ id: "first-day", period: "day" }),
		template({ id: "second-day", period: "day" }),
		template({ id: "work-any-period", account: "work" }),
		template({ id: "work-day", account: "work", period: "day" }),
		template({ id: "work-day-all-day", account: "work", period: "day", kind: "allDay" }),
	];
	assert.equal(matchingTemplate(templates, event(), "day")?.id, "work-day");
	assert.equal(matchingTemplate(templates, event({ accountId: "home" }), "day")?.id, "first-day");
	assert.equal(matchingTemplate(templates, event({ accountId: "home" }), "week")?.id, "any");
	assert.equal(matchingTemplate(templates, event({ allDay: true }), "week"), undefined);
	assert.equal(matchingTemplate(templates, event({ allDay: true }), "day")?.id, "work-day-all-day");
});

test("disabled templates never match", () => {
	const templates = [template({ id: "off", account: "work", enabled: false }), template({ id: "on" })];
	assert.equal(matchingTemplate(templates, event(), "day")?.id, "on");
	assert.equal(matchingTemplate([template({ enabled: false })], event(), "day"), undefined);
});

test("the default settings cover timed and all-day events in any period and account", () => {
	const { templates } = defaultSettings();
	assert.equal(matchingTemplate(templates, event(), "month")?.body, DEFAULT_TIMED_TEMPLATE);
	assert.equal(matchingTemplate(templates, event({ allDay: true }), "year")?.body, DEFAULT_ALL_DAY_TEMPLATE);
});
