import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { signInState } from "../src/calendar/googleAuth.ts";

const page = readFileSync(new URL("../docs/oauth/index.html", import.meta.url), "utf8");

const inlineScripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

const visit = (search: string) => {
	const replaced: string[] = [];
	const link = { href: "" };
	runInNewContext(inlineScripts[0], {
		URLSearchParams,
		TextDecoder,
		Uint8Array,
		atob,
		encodeURIComponent,
		location: { search, replace: (url: string) => replaced.push(url) },
		document: { getElementById: (id: string) => (id === "open" ? { setAttribute: (name: string, value: string) => name === "href" && (link.href = value) } : null) },
	});
	return { replaced, link: link.href };
};

test("the page allows only its own inline script and loads nothing else", () => {
	assert.equal(inlineScripts.length, 1);
	assert.doesNotMatch(page, /<script[^>]*\ssrc=|<link\s|<img\s|<iframe|url\(/i);
	assert.match(page, /<meta name="referrer" content="no-referrer">/);
	const hash = createHash("sha256").update(inlineScripts[0]).digest("base64");
	assert.ok(
		page.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'">`),
	);
});

test("the page forwards only the code, state and error, and names the vault from the state", () => {
	const state = signInState("nonce-1", "My Vault ñ");
	const { replaced, link } = visit(`?state=${encodeURIComponent(state)}&code=4%2Fabc&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly&authuser=0&redirect=https%3A%2F%2Fevil.example`);
	const expected = `obsidian://daily-agenda?vault=My%20Vault%20%C3%B1&code=4%2Fabc&state=${encodeURIComponent(state)}`;
	assert.deepEqual(replaced, [expected]);
	assert.equal(link, expected);
});

test("an error is forwarded to Obsidian as well", () => {
	const state = signInState("nonce-1", "Notes");
	assert.deepEqual(visit(`?error=access_denied&state=${state}`).replaced, [`obsidian://daily-agenda?vault=Notes&state=${state}&error=access_denied`]);
});

test("a state without a readable vault still goes to Obsidian and nowhere else", () => {
	assert.deepEqual(visit("?state=nonce.!!&code=x").replaced, ["obsidian://daily-agenda?code=x&state=nonce.!!"]);
	assert.deepEqual(visit("").replaced, ["obsidian://daily-agenda"]);
});
