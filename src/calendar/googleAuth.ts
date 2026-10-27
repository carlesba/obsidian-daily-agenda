export const GOOGLE_REDIRECT_URI = "https://carlesba.github.io/obsidian-daily-agenda/oauth/";

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export const PROTOCOL_ACTION = "daily-agenda";

export const SIGN_IN_LIFETIME_MS = 10 * 60 * 1000;

const VERIFIER_BYTES = 48;

const NONCE_BYTES = 32;

export function googleTokenSecretId(accountId: string): string {
	return `daily-agenda-${accountId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}-google-token`;
}

export interface PendingSignIn {
	verifier: string;
	accountId: string;
	createdAt: number;
}

export interface SignInStart {
	url: string;
	state: string;
	verifier: string;
}

export type SignInLookup = { ok: true; signIn: PendingSignIn } | { ok: false; reason: "unknown" | "expired" };

export function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomBase64Url(byteCount: number): string {
	return base64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

export function codeVerifier(): string {
	return randomBase64Url(VERIFIER_BYTES);
}

export async function codeChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return base64Url(new Uint8Array(digest));
}

export function signInState(nonce: string, vaultName: string): string {
	return `${nonce}.${base64Url(new TextEncoder().encode(vaultName))}`;
}

export function stateNonce(state: string): string {
	const dot = state.indexOf(".");
	return dot === -1 ? state : state.slice(0, dot);
}

export function authorizationUrl(clientId: string, challenge: string, state: string): string {
	const query = new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: GOOGLE_REDIRECT_URI,
		scope: GOOGLE_CALENDAR_SCOPE,
		access_type: "offline",
		prompt: "consent",
		code_challenge: challenge,
		code_challenge_method: "S256",
		state,
	});
	return `${GOOGLE_AUTHORIZE_URL}?${query.toString()}`;
}

export class PendingSignIns {
	private readonly entries = new Map<string, PendingSignIn>();
	private readonly now: () => number;

	constructor(now: () => number = Date.now) {
		this.now = now;
	}

	async start(accountId: string, clientId: string, vaultName: string): Promise<SignInStart> {
		const verifier = codeVerifier();
		const nonce = randomBase64Url(NONCE_BYTES);
		const state = signInState(nonce, vaultName);
		this.prune();
		this.entries.set(nonce, { verifier, accountId, createdAt: this.now() });
		return { url: authorizationUrl(clientId, await codeChallenge(verifier), state), state, verifier };
	}

	take(state: string | undefined): SignInLookup {
		if (!state) return { ok: false, reason: "unknown" };
		const nonce = stateNonce(state);
		const signIn = this.entries.get(nonce);
		this.entries.delete(nonce);
		this.prune();
		if (!signIn) return { ok: false, reason: "unknown" };
		if (this.isExpired(signIn)) return { ok: false, reason: "expired" };
		return { ok: true, signIn };
	}

	private isExpired(signIn: PendingSignIn): boolean {
		return this.now() - signIn.createdAt >= SIGN_IN_LIFETIME_MS;
	}

	private prune(): void {
		for (const [nonce, signIn] of this.entries) if (this.isExpired(signIn)) this.entries.delete(nonce);
	}
}
