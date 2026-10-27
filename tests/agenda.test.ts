import { test } from "node:test";
import { strict as assert } from "node:assert";
import { agendaLines, appendLines } from "../src/agenda/agenda.ts";
import { ANY } from "../src/settings.ts";
import type { AgendaTemplate } from "../src/settings.ts";
import { event } from "./events.ts";
import { moment } from "./moment.ts";

const templates: AgendaTemplate[] = [
	{ id: "timed", enabled: true, account: ANY, period: ANY, kind: "timed", body: "{{date}} {{start}} {{title}}" },
	{ id: "all-day", enabled: true, account: ANY, period: ANY, kind: "allDay", body: "{{date}} all day {{title}}" },
];

test("lines follow the start time with each day's all-day events first", () => {
	const events = [
		event({ title: "Late", start: new Date(2025, 2, 14, 17), end: new Date(2025, 2, 14, 18) }),
		event({ title: "Next day", start: new Date(2025, 2, 15, 8), end: new Date(2025, 2, 15, 9) }),
		event({ title: "Holiday", allDay: true, start: new Date(2025, 2, 15), end: new Date(2025, 2, 16) }),
		event({ title: "Early", start: new Date(2025, 2, 14, 8), end: new Date(2025, 2, 14, 9) }),
		event({ title: "Offsite", allDay: true, start: new Date(2025, 2, 14), end: new Date(2025, 2, 15) }),
	];
	assert.deepEqual(agendaLines(events, templates, "week", moment), [
		"2025-03-14 all day Offsite",
		"2025-03-14 08:00 Early",
		"2025-03-14 17:00 Late",
		"2025-03-15 all day Holiday",
		"2025-03-15 08:00 Next day",
	]);
});

test("events without a matching template are skipped", () => {
	const timedOnly = templates.slice(0, 1);
	const events = [event({ title: "Holiday", allDay: true, start: new Date(2025, 2, 14), end: new Date(2025, 2, 15) }), event()];
	assert.deepEqual(agendaLines(events, timedOnly, "day", moment), ["2025-03-14 09:30 Planning"]);
});

test("lines are appended after a newline that separates them from the note", () => {
	assert.equal(appendLines("# Today\n", ["- a", "- b"]), "# Today\n- a\n- b\n");
	assert.equal(appendLines("# Today", ["- a", "- b"]), "# Today\n- a\n- b\n");
	assert.equal(appendLines("", ["- a"]), "- a\n");
	assert.equal(appendLines("# Today", []), "# Today");
});
