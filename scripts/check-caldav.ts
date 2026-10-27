import { fetchCalDavEvents } from "../src/calendar/caldav.ts";
import type { Http } from "../src/calendar/http.ts";

const [username, serverUrl = "https://caldav.icloud.com"] = process.argv.slice(2);
if (!username) {
	console.error("Usage: node scripts/check-caldav.ts <apple-id-email> [server-url]");
	process.exit(2);
}

const password = process.env.CALDAV_PASSWORD?.trim();
if (!password) {
	console.error("Set CALDAV_PASSWORD to the app-specific password.");
	process.exit(2);
}

const loggingFetch: Http = async (request) => {
	const response = await fetch(request.url, {
		method: request.method,
		headers: request.headers,
		body: request.body,
		redirect: "manual",
	});
	console.log(`${request.method} ${request.url} (Depth ${request.headers.Depth ?? "-"}) → ${response.status}`);
	return { status: response.status, headers: Object.fromEntries(response.headers), text: await response.text() };
};

const start = new Date();
start.setHours(0, 0, 0, 0);
const end = new Date(start);
end.setDate(end.getDate() + 1);

try {
	const events = await fetchCalDavEvents(
		loggingFetch,
		{ serverUrl, username, password },
		{ start, end },
		{ accountId: "check", accountName: "check", calendarName: "check" },
	);
	console.log(`OK: ${events.length} events today`);
	for (const event of events) console.log(`  ${event.start.toLocaleTimeString()} [${event.calendarName}] ${event.title}`);
} catch (error) {
	console.error("FAILED:", error);
	process.exit(1);
}

