import { Notice } from "obsidian";
import type { App, ObsidianProtocolData } from "obsidian";
import { accountName, googleClient, googleConnection } from "./calendar/accounts";
import { exchangeCode, listCalendars, validAccessToken } from "./calendar/google";
import type { AccessTokens } from "./calendar/google";
import { PendingSignIns, googleTokenSecretId } from "./calendar/googleAuth";
import { failureReason } from "./failureMessages";
import { t, tCount } from "./i18n";
import { obsidianHttp } from "./obsidianHttp";
import type { Account, AgendaSettings } from "./settings";
import type { GoogleActions } from "./settings/pages";

export interface GoogleSignInHost {
	app: App;
	settings: () => AgendaSettings;
	save: () => Promise<void>;
	refreshSettings: () => void;
	tokens: AccessTokens;
}

export class GoogleSignIn implements GoogleActions {
	private readonly host: GoogleSignInHost;
	private readonly pending = new PendingSignIns();

	constructor(host: GoogleSignInHost) {
		this.host = host;
	}

	signIn = (account: Account): void => void this.openConsent(account);

	signOut = (account: Account): void => void this.forget(account);

	refreshCalendars = (account: Account): void => void this.reloadCalendars(account);

	async handleRedirect(params: ObsidianProtocolData): Promise<void> {
		const state: string | undefined = params.state;
		const code: string | undefined = params.code;
		const error: string | undefined = params.error;
		const lookup = this.pending.take(state);
		if (!lookup.ok) {
			new Notice(t("signInRejected"));
			return;
		}
		if (error) {
			new Notice(t("signInDenied", { error }));
			return;
		}
		const account = this.host.settings().accounts.find((candidate) => candidate.id === lookup.signIn.accountId);
		if (!account || account.kind !== "google" || !code) {
			new Notice(t("signInRejected"));
			return;
		}
		try {
			const granted = await exchangeCode(obsidianHttp, googleClient(account, this.readSecret), code, lookup.signIn.verifier);
			const tokenSecret = googleTokenSecretId(account.id);
			this.host.app.secretStorage.setSecret(tokenSecret, granted.refreshToken);
			account.tokenSecret = tokenSecret;
			this.host.tokens.set(account.id, { accessToken: granted.accessToken, expiresAt: granted.expiresAt });
			await this.host.save();
			const listing = await listCalendars(obsidianHttp, granted.accessToken, account.calendars);
			account.email = listing.email;
			account.calendars = listing.calendars;
			await this.host.save();
			new Notice(account.email ? t("signedInAs", { email: account.email }) : t("signedIn"));
		} catch (failure) {
			console.error(`Daily Agenda: could not sign in to "${accountName(account)}"`, failure);
			new Notice(t("signInFailed", { account: accountName(account), reason: failureReason(failure) }));
		}
		this.host.refreshSettings();
	}

	private readonly readSecret = (id: string): string | null => this.host.app.secretStorage.getSecret(id);

	private async openConsent(account: Account): Promise<void> {
		try {
			const client = googleClient(account, this.readSecret);
			const { url } = await this.pending.start(account.id, client.clientId, this.host.app.vault.getName());
			window.open(url);
		} catch {
			new Notice(t("signInNeedsClient"));
		}
	}

	private async forget(account: Account): Promise<void> {
		if (account.tokenSecret.trim() !== "") this.host.app.secretStorage.setSecret(account.tokenSecret.trim(), "");
		account.tokenSecret = "";
		account.email = "";
		account.calendars = [];
		this.host.tokens.delete(account.id);
		await this.host.save();
		new Notice(t("signedOut"));
		this.host.refreshSettings();
	}

	private async reloadCalendars(account: Account): Promise<void> {
		try {
			const accessToken = await validAccessToken(obsidianHttp, googleConnection(account, this.readSecret), this.host.tokens);
			const listing = await listCalendars(obsidianHttp, accessToken, account.calendars);
			if (listing.email) account.email = listing.email;
			account.calendars = listing.calendars;
			await this.host.save();
			new Notice(tCount("calendarsRefreshedOne", "calendarsRefreshedOther", listing.calendars.length));
		} catch (failure) {
			console.error(`Daily Agenda: could not list the calendars of "${accountName(account)}"`, failure);
			new Notice(t("accountFailed", { account: accountName(account), reason: failureReason(failure) }));
		}
		this.host.refreshSettings();
	}
}
