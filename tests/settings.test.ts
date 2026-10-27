import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ANY, defaultSettings, mergeSettings, newAccount, newTemplate } from "../src/settings.ts";
import { templateKey, writeControl } from "../src/settings/controlKeys.ts";
import { templateSummary } from "../src/settings/labels.ts";

test("a template row summarises its period, events and account", () => {
	const settings = defaultSettings();
	const account = { ...newAccount(settings.accounts), name: "Work" };
	settings.accounts.push(account);
	const template = { ...newTemplate(settings.templates), period: "day" as const, account: account.id };
	assert.equal(templateSummary(template, settings.accounts), "Day · Timed · Work");
	assert.equal(templateSummary(settings.templates[1], settings.accounts), "Any period · All-day · Any account");
	assert.equal(templateSummary({ ...template, account: "gone" }, settings.accounts), "Day · Timed · Removed account");
});

test("stored settings keep valid entries and fall back for the rest", () => {
	const merged = mergeSettings({
		accounts: [{ id: "a", name: "Home", kind: "ics", urlSecret: "home-ics" }, { name: "no id" }],
		templates: [{ id: "t", period: "fortnight", kind: "allDay", body: "{{title}}" }],
	});
	assert.deepEqual(merged.accounts.map((account) => [account.id, account.kind, account.enabled, account.serverUrl]), [
		["a", "ics", true, "https://caldav.icloud.com"],
	]);
	assert.deepEqual(merged.templates, [{ id: "t", enabled: true, account: ANY, period: ANY, kind: "allDay", body: "{{title}}" }]);
	assert.deepEqual(mergeSettings(undefined), defaultSettings());
});

test("a template line stays on one line", () => {
	const settings = defaultSettings();
	const [template] = settings.templates;
	assert.ok(writeControl(settings, templateKey(template.id, "body"), "- {{title}}\n{{location}}"));
	assert.equal(template.body, "- {{title}} {{location}}");
});

test("a Google account keeps its client, token ID, email and calendars", () => {
	const merged = mergeSettings({
		accounts: [
			{
				id: "g",
				kind: "google",
				clientId: "client",
				clientSecret: "google-client-secret",
				tokenSecret: "daily-agenda-g-google-token",
				email: "someone@example.com",
				calendars: [{ id: "someone@example.com", name: "Personal" }, { id: "team", name: "Team", enabled: false }, { name: "no id" }],
			},
		],
	});
	const [account] = merged.accounts;
	assert.deepEqual([account.kind, account.clientId, account.clientSecret, account.tokenSecret, account.email], [
		"google",
		"client",
		"google-client-secret",
		"daily-agenda-g-google-token",
		"someone@example.com",
	]);
	assert.deepEqual(account.calendars, [
		{ id: "someone@example.com", name: "Personal", enabled: true },
		{ id: "team", name: "Team", enabled: false },
	]);
});
