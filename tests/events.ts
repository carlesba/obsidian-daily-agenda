import type { AgendaEvent } from "../src/calendar/event.ts";

export const event = (overrides: Partial<AgendaEvent> = {}): AgendaEvent => ({
	accountId: "work",
	accountName: "Work",
	calendar: "Team",
	title: "Planning",
	start: new Date(2025, 2, 14, 9, 30),
	end: new Date(2025, 2, 14, 10, 15),
	allDay: false,
	location: "",
	description: "",
	url: "",
	organizer: "",
	attendees: [],
	status: "",
	...overrides,
});
