import { childElement, childElements, parseXml, textOf } from "./xml.ts";
import type { XmlElement } from "./xml.ts";

export interface DavResponse {
	href: string;
	properties: XmlElement[];
}

export interface DavCalendar {
	url: string;
	name: string;
}

export function parseMultistatus(xml: string): DavResponse[] {
	return childElements(parseXml(xml), "response").map((response) => ({
		href: textOf(childElement(response, "href")),
		properties: childElements(response, "propstat")
			.filter(isSuccessful)
			.flatMap((propstat) => childElement(propstat, "prop")?.children ?? []),
	}));
}

export function currentUserPrincipal(xml: string, requestUrl: string): string | undefined {
	return firstHrefOf(xml, "current-user-principal", requestUrl);
}

export function calendarHomeSet(xml: string, requestUrl: string): string | undefined {
	return firstHrefOf(xml, "calendar-home-set", requestUrl);
}

export function eventCalendars(xml: string, homeUrl: string): DavCalendar[] {
	return parseMultistatus(xml).flatMap((response) => {
		const property = (name: string) => response.properties.find((candidate) => candidate.name === name);
		const isCalendar = childElement(property("resourcetype"), "calendar") !== undefined;
		if (!isCalendar || !supportsEvents(property("supported-calendar-component-set"))) return [];
		const url = resolveHref(response.href, homeUrl);
		return [{ url, name: textOf(property("displayname")) || lastPathSegment(url) }];
	});
}

export function calendarObjects(xml: string): string[] {
	return parseMultistatus(xml).flatMap((response) =>
		response.properties.filter((property) => property.name === "calendar-data").map((property) => property.text.trim()),
	).filter((data) => data !== "");
}

export function resolveHref(href: string, base: string): string {
	return new URL(href, base).toString();
}

function firstHrefOf(xml: string, propertyName: string, requestUrl: string): string | undefined {
	for (const response of parseMultistatus(xml)) {
		const property = response.properties.find((candidate) => candidate.name === propertyName);
		const href = textOf(childElement(property, "href"));
		if (href !== "") return resolveHref(href, requestUrl);
	}
	return undefined;
}

function supportsEvents(componentSet: XmlElement | undefined): boolean {
	if (!componentSet) return true;
	return childElements(componentSet, "comp").some((component) => component.attributes.name?.toUpperCase() === "VEVENT");
}

function isSuccessful(propstat: XmlElement): boolean {
	const status = textOf(childElement(propstat, "status"));
	return status === "" || /\s2\d\d(\s|$)/.test(status);
}

function lastPathSegment(url: string): string {
	const segments = new URL(url).pathname.split("/").filter((segment) => segment !== "");
	return decodeURIComponent(segments[segments.length - 1] ?? url);
}
