import type { App, Setting, SettingDefinitionItem, SettingDefinitionPage, SettingDefinitionRender } from "obsidian";
import { t } from "../i18n";
import type { Account, AgendaSettings, AgendaTemplate } from "../settings";
import { accountKey, templateKey } from "./controlKeys";
import type { AccountField } from "./controlKeys";
import {
	accountKindOptions,
	accountLabel,
	accountOptions,
	accountSummary,
	eventKindOptions,
	hasSignInDetails,
	periodOptions,
	templateSummary,
	templateUsesRemovedAccount,
} from "./labels";

export interface PageContext {
	app: App;
	settings: AgendaSettings;
	write: (key: string, value: unknown) => void;
	openPage: (pageId: string) => void;
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
				render: secretInput(context, key("passwordSecret"), secretId(account, "password"), () => account.passwordSecret),
			},
			{
				name: t("serverUrl"),
				desc: t("serverUrlDesc"),
				visible: isIcloud,
				control: { type: "text", key: key("serverUrl"), placeholder: "https://caldav.icloud.com" },
			},
			{
				name: t("calendarUrl"),
				desc: t("calendarUrlDesc"),
				visible: () => account.kind === "ics",
				render: secretInput(context, key("urlSecret"), secretId(account, "url"), () => account.urlSecret),
			},
		],
	};
	return page;
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

function secretInput(
	context: PageContext,
	key: string,
	ownId: string,
	storedId: () => string,
): (setting: Setting) => void {
	return (setting) => {
		setting.addText((text) => {
			text.inputEl.type = "password";
			text.inputEl.autocomplete = "off";
			const saved = storedId() !== "" && context.app.secretStorage.getSecret(storedId()) !== null;
			text.setPlaceholder(saved ? t("secretSaved") : t("secretPaste"));
			text.onChange((value) => {
				const secret = value.trim();
				if (secret === "") return;
				context.app.secretStorage.setSecret(ownId, secret);
				if (storedId() !== ownId) context.write(key, ownId);
			});
		});
	};
}

function secretId(account: Account, field: "password" | "url"): string {
	const accountPart = account.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
	return `daily-agenda-${accountPart}-${field}`;
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
	});
}
