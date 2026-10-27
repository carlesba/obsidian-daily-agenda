import { requestUrl } from "obsidian";
import type { Http } from "./calendar/http";

export const obsidianHttp: Http = async (request) => {
	const response = await requestUrl({
		url: request.url,
		method: request.method,
		headers: request.headers,
		body: request.body,
		throw: false,
	});
	return { status: response.status, headers: response.headers, text: response.text };
};
