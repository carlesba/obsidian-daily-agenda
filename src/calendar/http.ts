export interface HttpRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

export interface HttpResponse {
	status: number;
	headers: Record<string, string>;
	text: string;
}

export type Http = (request: HttpRequest) => Promise<HttpResponse>;

export type CalendarErrorReason = "missingCredentials" | "authenticationFailed" | "requestFailed" | "noPrincipal" | "noCalendarHome" | "signedOut" | "notICalFeed" | "googlePublicAddress";

export class CalendarError extends Error {
	readonly reason: CalendarErrorReason;
	readonly status?: number;
	readonly url?: string;

	constructor(reason: CalendarErrorReason, status?: number, url?: string) {
		super([reason, status, url].filter((part) => part !== undefined).join(" "));
		this.reason = reason;
		this.status = status;
		this.url = url;
	}
}

const MAX_REDIRECTS = 5;

export async function send(http: Http, request: HttpRequest): Promise<HttpResponse & { url: string }> {
	let current = request;
	for (let redirects = 0; ; redirects++) {
		const response = await http(current);
		const location = headerValue(response.headers, "location");
		if (isRedirect(response.status) && location && redirects < MAX_REDIRECTS) {
			current = { ...current, url: new URL(location, current.url).toString() };
			continue;
		}
		if (response.status === 401 || response.status === 403) throw new CalendarError("authenticationFailed", response.status, current.url);
		if (response.status < 200 || response.status >= 300) throw new CalendarError("requestFailed", response.status, current.url);
		return { ...response, url: current.url };
	}
}

export function basicAuthorization(username: string, password: string): string {
	const bytes = new TextEncoder().encode(`${username}:${password}`);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `Basic ${btoa(binary)}`;
}

function isRedirect(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
	const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
	return key === undefined ? undefined : headers[key];
}
