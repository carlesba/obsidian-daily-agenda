import { SecretComponent } from "obsidian";
import type { App, Setting, SettingDefinitionItem, SettingDefinitionPage, SettingDefinitionRender } from "obsidian";
import { t } from "../i18n";
import type { Account, AgendaSettings, AgendaTemplate } from "../settings";
import { GOOGLE_REDIRECT_URI } from "../calendar/googleAuth";
import { accountKey, calendarKey, templateKey } from "./controlKeys";
import type { AccountField } from "./controlKeys";
import {
	accountKindOptions,
	accountLabel,
	accountOptions,
	accountSummary,
	eventKindOptions,
	hasSignInDetails,
	isSignedIn,
	periodOptions,
	templateSummary,
	templateUsesRemovedAccount,
} from "./labels";

export interface PageContext {
	app: App;
	settings: AgendaSettings;
	write: (key: string, value: unknown) => void;
	openPage: (pageId: string) => void;
	google: GoogleActions;
}

export interface GoogleActions {
	signIn: (account: Account) => void;
	signOut: (account: Account) => void;
	refreshCalendars: (account: Account) => void;
}

type IdentifiedPage = SettingDefinitionPage & { id: string };

interface EditableRow {
	pageId: string;
	name: string;
	desc: string;
	enabled: boolean;
	enabledKey: string;
	enabledTooltip: string;
	editTooltip: string;
}

export function accountPageId(account: Account): string {
	return `account-${account.id}`;
}

export function templatePageId(template: AgendaTemplate): string {
	return `template-${template.id}`;
}

export function accountRow(account: Account, context: PageContext): SettingDefinitionRender {
	return editableRow(
		{
			pageId: accountPageId(account),
			name: accountLabel(account),
			desc: accountSummary(account),
			enabled: account.enabled,
			enabledKey: accountKey(account.id, "enabled"),
			enabledTooltip: t("readAccount"),
			editTooltip: t("editAccount"),
		},
		context,
	);
}

export function templateRow(template: AgendaTemplate, context: PageContext): SettingDefinitionRender {
	return editableRow(
		{
			pageId: templatePageId(template),
			name: templateSummary(template, context.settings.accounts),
			desc: template.body,
			enabled: template.enabled,
			enabledKey: templateKey(template.id, "enabled"),
			enabledTooltip: t("useTemplate"),
			editTooltip: t("editTemplate"),
		},
		context,
	);
}

export function accountPage(account: Account, context: PageContext): SettingDefinitionPage {
	const key = (field: AccountField) => accountKey(account.id, field);
	const isIcloud = () => account.kind === "icloud";
	const page: IdentifiedPage = {
		type: "page",
		id: accountPageId(account),
		name: accountLabel(account),
		displayValue: account.enabled ? "" : t("off"),
		status: hasSignInDetails(account) ? null : "warning",
		items: [
			{ name: t("enabled"), control: { type: "toggle", key: key("enabled") } },
			{
				name: t("accountName"),
				desc: t("accountNameDesc"),
				control: { type: "text", key: key("name"), placeholder: t("accountNamePlaceholder") },
			},
			{ name: t("accountKind"), control: { type: "dropdown", key: key("kind"), options: accountKindOptions() } },
			{
				name: t("appleId"),
				desc: t("appleIdDesc"),
				visible: isIcloud,
				control: { type: "text", key: key("username"), placeholder: "name@example.com" },
			},
			{
				name: t("appSpecificPassword"),
				desc: appSpecificPasswordHelp(),
				visible: isIcloud,
				render: secretInput(context, key("passwordSecret"), () => account.passwordSecret),
			},
			{
				name: t("serverUrl"),
				desc: t("serverUrlDesc"),
				visible: isIcloud,
				control: { type: "text", key: key("serverUrl"), placeholder: "https://caldav.icloud.com" },
			},
			{
				name: t("calendarUrl"),
				desc: withKeychainExplanation(t("calendarUrlDesc"), "google-calendar-url"),
				visible: () => account.kind === "ics",
				render: secretInput(context, key("urlSecret"), () => account.urlSecret),
			},
			...googleItems(account, context),
		],
	};
	return page;
}

function googleItems(account: Account, context: PageContext): SettingDefinitionItem[] {
	const key = (field: AccountField) => accountKey(account.id, field);
	const isGoogle = () => account.kind === "google";
	const signedIn = () => isGoogle() && isSignedIn(account);
	const canSignIn = () => account.clientId.trim() !== "" && hasSecret(context, account.clientSecret);
	return [
		{ name: t("googleSetup"), desc: googleSetupHelp(), visible: isGoogle },
		{
			name: t("clientId"),
			desc: t("clientIdDesc"),
			visible: isGoogle,
			control: { type: "text", key: key("clientId"), placeholder: "1234567890-example.apps.googleusercontent.com" },
		},
		{
			name: t("clientSecret"),
			desc: withKeychainExplanation(t("clientSecretDesc"), "google-client-secret"),
			visible: isGoogle,
			render: secretInput(context, key("clientSecret"), () => account.clientSecret),
		},
		{
			name: t("signInWithGoogle"),
			desc: canSignIn() ? t("signInDesc") : t("signInNeedsClient"),
			visible: () => isGoogle() && !isSignedIn(account),
			render: (setting) => {
				setting.addButton((button) =>
					button
						.setButtonText(t("signInWithGoogle"))
						.setCta()
						.setDisabled(!canSignIn())
						.onClick(() => context.google.signIn(account)),
				);
			},
		},
		{
			name: account.email ? t("signedInAs", { email: account.email }) : t("signedIn"),
			desc: t("signedInDesc"),
			visible: signedIn,
			render: (setting) => {
				setting.addButton((button) => button.setButtonText(t("signOut")).onClick(() => context.google.signOut(account)));
			},
		},
		{
			name: t("refreshCalendars"),
			desc: t("refreshCalendarsDesc"),
			visible: signedIn,
			render: (setting) => {
				setting.addButton((button) =>
					button.setButtonText(t("refreshCalendars")).onClick(() => context.google.refreshCalendars(account)),
				);
			},
		},
		...(account.calendars.length === 0
			? [{ name: t("calendars"), desc: t("noCalendars"), visible: signedIn }]
			: account.calendars.map((calendar) => ({
					name: calendar.name,
					desc: calendar.id === calendar.name ? "" : calendar.id,
					visible: signedIn,
					control: { type: "toggle" as const, key: calendarKey(account.id, calendar.id) },
				}))),
	];
}

function hasSecret(context: PageContext, id: string): boolean {
	return id.trim() !== "" && (context.app.secretStorage.getSecret(id.trim())?.trim() ?? "") !== "";
}

export function templatePage(template: AgendaTemplate, context: PageContext): SettingDefinitionPage {
	const { accounts } = context.settings;
	const items: SettingDefinitionItem[] = [
		{ name: t("placeholders"), desc: t("placeholdersDesc") },
		{ name: t("enabled"), control: { type: "toggle", key: templateKey(template.id, "enabled") } },
		{
			name: t("templatePeriod"),
			desc: t("templatePeriodDesc"),
			control: { type: "dropdown", key: templateKey(template.id, "period"), options: periodOptions() },
		},
		{
			name: t("templateKind"),
			desc: t("templateKindDesc"),
			control: { type: "dropdown", key: templateKey(template.id, "kind"), options: eventKindOptions() },
		},
		{
			name: t("templateAccount"),
			control: { type: "dropdown", key: templateKey(template.id, "account"), options: accountOptions(accounts, template.account) },
		},
		{
			name: t("templateLine"),
			desc: t("templateLineDesc"),
			render: (setting: Setting) => {
				setting.settingEl.addClass("daily-agenda-template-line");
				setting.addText((text) =>
					text.setValue(template.body).onChange((typed) => {
						const missing = typed.trim() === "";
						setting.setDesc(missing ? t("templateLineRequired") : t("templateLineDesc"));
						context.write(templateKey(template.id, "body"), typed);
					}),
				);
			},
		},
	];
	const page: IdentifiedPage = {
		type: "page",
		id: templatePageId(template),
		name: templateSummary(template, accounts),
		status: templateUsesRemovedAccount(template, accounts) || template.body.trim() === "" ? "warning" : null,
		items,
	};
	return page;
}

function secretInput(context: PageContext, key: string, value: () => string): (setting: Setting) => void {
	return (setting) => {
		setting.addComponent((el) =>
			new SecretComponent(context.app, el).setValue(value()).onChange((secretId) => context.write(key, secretId ?? "")),
		);
	};
}

function editableRow(row: EditableRow, context: PageContext): SettingDefinitionRender & { id: string } {
	return {
		id: `${row.pageId}-row`,
		name: row.name,
		desc: row.desc,
		render: (setting) => {
			setting.addToggle((toggle) =>
				toggle
					.setTooltip(row.enabledTooltip)
					.setValue(row.enabled)
					.onChange((enabled) => context.write(row.enabledKey, enabled)),
			);
			setting.addExtraButton((button) =>
				button
					.setIcon("pencil")
					.setTooltip(row.editTooltip)
					.onClick(() => context.openPage(row.pageId)),
			);
		},
	};
}

const APPLE_ACCOUNT_URL = "https://account.apple.com";

const APP_SPECIFIC_PASSWORD_HELP_URL = "https://support.apple.com/102654";

function appSpecificPasswordHelp(): DocumentFragment {
	return createFragment((fragment) => {
		fragment.appendText(t("appSpecificPasswordDesc"));
		const steps = fragment.createEl("ol");
		const signIn = steps.createEl("li");
		signIn.createEl("a", { text: t("appSpecificPasswordStepSignIn"), href: APPLE_ACCOUNT_URL });
		steps.createEl("li", { text: t("appSpecificPasswordStepOpen") });
		steps.createEl("li", { text: t("appSpecificPasswordStepGenerate") });
		fragment.appendText(`${t("appSpecificPasswordNotes")} `);
		fragment.createEl("a", { text: t("appSpecificPasswordHelp"), href: APP_SPECIFIC_PASSWORD_HELP_URL });
		appendKeychainExplanation(fragment, "icloud-password");
	});
}

const GOOGLE_CREDENTIALS_URL = "https://console.cloud.google.com/apis/credentials";

function googleSetupHelp(): DocumentFragment {
	return createFragment((fragment) => {
		fragment.appendText(t("googleSetupDesc"));
		const steps = fragment.createEl("ol");
		steps.createEl("li", { text: t("googleSetupStepProject") });
		steps.createEl("li", { text: t("googleSetupStepConsent") });
		steps.createEl("li", { text: t("googleSetupStepClient", { redirect: GOOGLE_REDIRECT_URI }) });
		steps.createEl("li", { text: t("googleSetupStepPaste") });
		fragment.createEl("a", { text: t("googleConsole"), href: GOOGLE_CREDENTIALS_URL });
	});
}

function withKeychainExplanation(description: string, example: string): DocumentFragment {
	return createFragment((fragment) => {
		fragment.appendText(description);
		appendKeychainExplanation(fragment, example);
	});
}

function appendKeychainExplanation(fragment: DocumentFragment, example: string): void {
	fragment.createEl("p", { text: t("keychainExplanation", { example }) });
}
