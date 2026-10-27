import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
	GOOGLE_REDIRECT_URI,
	PendingSignIns,
	SIGN_IN_LIFETIME_MS,
	codeChallenge,
	codeVerifier,
	googleTokenSecretId,
	signInState,
	stateNonce,
} from "../src/calendar/googleAuth.ts";

test("the code challenge is the S256 hash from RFC 7636 appendix B", async () => {
	assert.equal(await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("a code verifier uses only unreserved characters within the allowed length", () => {
	const verifier = codeVerifier();
	assert.match(verifier, /^[A-Za-z0-9\-._~]{43,128}$/);
	assert.notEqual(verifier, codeVerifier());
});

test("the state carries the nonce and the vault name in base64url", () => {
	const state = signInState("nonce", "Vault ñ/+");
	assert.equal(stateNonce(state), "nonce");
	const encoded = state.slice("nonce.".length);
	assert.match(encoded, /^[A-Za-z0-9_-]+$/);
	assert.equal(Buffer.from(encoded, "base64url").toString("utf8"), "Vault ñ/+");
});

test("signing in opens Google with PKCE, offline access and the read-only scope", async () => {
	const pending = new PendingSignIns(() => 0);
	const { url, state, verifier } = await pending.start("account-1", "client.apps.googleusercontent.com", "Notes");
	const parsed = new URL(url);
	assert.equal(`${parsed.origin}${parsed.pathname}`, "https://accounts.google.com/o/oauth2/v2/auth");
	assert.deepEqual(Object.fromEntries(parsed.searchParams), {
		response_type: "code",
		client_id: "client.apps.googleusercontent.com",
		redirect_uri: GOOGLE_REDIRECT_URI,
		scope: "https://www.googleapis.com/auth/calendar.readonly",
		access_type: "offline",
		prompt: "consent",
		code_challenge: await codeChallenge(verifier),
		code_challenge_method: "S256",
		state,
	});
	assert.ok(Buffer.from(stateNonce(state), "base64url").length >= 16);
});

test("a pending sign-in is accepted once, with its verifier and account", async () => {
	const pending = new PendingSignIns(() => 1000);
	const { state, verifier } = await pending.start("account-1", "client", "Notes");
	assert.deepEqual(pending.take(state), { ok: true, signIn: { verifier, accountId: "account-1", createdAt: 1000 } });
	assert.deepEqual(pending.take(state), { ok: false, reason: "unknown" });
});

test("an unknown or missing state is rejected", async () => {
	const pending = new PendingSignIns(() => 0);
	await pending.start("account-1", "client", "Notes");
	assert.deepEqual(pending.take(signInState("forged", "Notes")), { ok: false, reason: "unknown" });
	assert.deepEqual(pending.take(undefined), { ok: false, reason: "unknown" });
	assert.deepEqual(pending.take(""), { ok: false, reason: "unknown" });
});

test("a sign-in older than ten minutes is rejected", async () => {
	let now = 0;
	const pending = new PendingSignIns(() => now);
	const early = await pending.start("account-1", "client", "Notes");
	const late = await pending.start("account-1", "client", "Notes");
	now = SIGN_IN_LIFETIME_MS - 1;
	assert.equal(pending.take(early.state).ok, true);
	now = SIGN_IN_LIFETIME_MS;
	assert.deepEqual(pending.take(late.state), { ok: false, reason: "expired" });
});

test("the refresh token is stored under an ID derived from the account", () => {
	assert.equal(googleTokenSecretId("Account_1 é"), "daily-agenda-account-1---google-token");
	assert.equal(googleTokenSecretId("account-2"), "daily-agenda-account-2-google-token");
});
