export interface AgendaEvent {
	accountId: string;
	accountName: string;
	calendar: string;
	title: string;
	start: Date;
	end: Date;
	allDay: boolean;
	location: string;
	description: string;
	url: string;
	organizer: string;
	attendees: string[];
	status: string;
}

export interface CalendarOrigin {
	accountId: string;
	accountName: string;
	calendarName?: string;
}
