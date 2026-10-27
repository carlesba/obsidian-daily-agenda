import { t } from "../i18n/index.ts";
import { PERIODS } from "../periodic/dateNotes.ts";
import { ANY } from "../settings.ts";
import type { Account, AccountKind, AgendaTemplate, AnyPeriod, EventKind } from "../settings.ts";
import { periodName } from "./dateNotesForm.ts";

export function accountKindOptions(): Record<AccountKind, string> {
	return { icloud: t("kindIcloud"), ics: t("kindIcs"), google: t("kindGoogle") };
}

export function eventKindOptions(): Record<EventKind, string> {
	return { timed: t("kindTimed"), allDay: t("kindAllDay") };
}

export function periodOptions(): Record<AnyPeriod, string> {
	const options = { [ANY]: t("anyPeriod") } as Record<AnyPeriod, string>;
	for (const period of PERIODS) options[period] = periodName(period);
	return options;
}

export function accountOptions(accounts: readonly Account[], chosen: string): Record<string, string> {
	const options: Record<string, string> = { [ANY]: t("anyAccount") };
	for (const account of accounts) options[account.id] = accountLabel(account);
	if (!(chosen in options)) options[chosen] = t("removedAccount");
	return options;
}

export function accountLabel(account: Account): string {
	return account.name.trim() || t("unnamedAccount");
}

export function hasSignInDetails(account: Account): boolean {
	if (account.kind === "ics") return account.urlSecret.trim() !== "";
	if (account.kind === "google") return isSignedIn(account);
	return account.username.trim() !== "" && account.passwordSecret.trim() !== "";
}

export function isSignedIn(account: Account): boolean {
	return account.clientId.trim() !== "" && account.clientSecret.trim() !== "" && account.tokenSecret.trim() !== "";
}

export function accountSummary(account: Account): string {
	const kind = accountKindOptions()[account.kind];
	return hasSignInDetails(account) ? kind : `${kind} · ${t("needsSignIn")}`;
}

export function templateSummary(template: AgendaTemplate, accounts: readonly Account[]): string {
	const period = periodOptions()[template.period];
	const kind = eventKindOptions()[template.kind];
	const account = accountOptions(accounts, template.account)[template.account];
	return `${period} · ${kind} · ${account}`;
}

export function templateUsesRemovedAccount(template: AgendaTemplate, accounts: readonly Account[]): boolean {
	return template.account !== ANY && !accounts.some((account) => account.id === template.account);
}
