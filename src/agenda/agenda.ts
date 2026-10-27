import type { AgendaEvent } from "../calendar/event.ts";
import type { Period } from "../periodic/dateNotes.ts";
import type { AgendaTemplate } from "../settings.ts";
import type { MomentFactory } from "../time.ts";
import { matchingTemplate, renderTemplate } from "./template.ts";

export function agendaLines(
	events: readonly AgendaEvent[],
	templates: readonly AgendaTemplate[],
	period: Period,
	moment: MomentFactory,
): string[] {
	return inAgendaOrder(events).flatMap((event) => {
		const template = matchingTemplate(templates, event, period);
		return template ? [renderTemplate(template.body, event, moment)] : [];
	});
}

export function inAgendaOrder(events: readonly AgendaEvent[]): AgendaEvent[] {
	return events
		.map((event, index) => ({ event, index }))
		.sort(
			(a, b) =>
				localDay(a.event.start) - localDay(b.event.start) ||
				Number(!a.event.allDay) - Number(!b.event.allDay) ||
				a.event.start.valueOf() - b.event.start.valueOf() ||
				a.index - b.index,
		)
		.map(({ event }) => event);
}

export function appendLines(content: string, lines: readonly string[]): string {
	if (lines.length === 0) return content;
	const block = `${lines.join("\n")}\n`;
	if (content === "") return block;
	return content.endsWith("\n") ? `${content}${block}` : `${content}\n${block}`;
}

function localDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf();
}
