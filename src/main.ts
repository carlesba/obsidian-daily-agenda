import { MarkdownView, Notice, Plugin, getLanguage, moment } from "obsidian";
import type { TFile } from "obsidian";
import { agendaLines, appendLines, linesMissingFrom } from "./agenda/agenda";
import { accountName, fetchAgenda } from "./calendar/accounts";
import type { AccountFailure } from "./calendar/accounts";
import { CalendarError } from "./calendar/http";
import { DEFAULT_LANGUAGE, setLanguage, t, tCount } from "./i18n";
import { obsidianHttp } from "./obsidianHttp";
import { resolveDateNotes } from "./periodic/dateNotes";
import { periodicPluginSettings } from "./periodic/obsidianPlugins";
import { parsePeriodicNote, periodRange } from "./periodic/periodicNote";
import type { PeriodicNote } from "./periodic/periodicNote";
import { defaultSettings, mergeSettings } from "./settings";
import type { AgendaSettings } from "./settings";
import { DailyAgendaSettingTab } from "./settingsTab";
import type { MomentFactory } from "./time";

const momentFactory = moment as unknown as MomentFactory;

export default class DailyAgendaPlugin extends Plugin {
	settings: AgendaSettings = defaultSettings();

	async onload(): Promise<void> {
		try {
			setLanguage(getLanguage());
		} catch {
			setLanguage(DEFAULT_LANGUAGE);
		}
		this.settings = mergeSettings(await this.loadData());
		this.addSettingTab(new DailyAgendaSettingTab(this.app, this));

		this.addCommand({
			id: "sync-agenda",
			name: t("syncAgenda"),
			icon: "calendar-sync",
			callback: () => {
				const target = this.activePeriodicNote();
				if (!target) {
					new Notice(t("noDateFound"));
					return;
				}
				void this.syncAgenda(target.file, target.note);
			},
		});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private activePeriodicNote(): { file: TFile; note: PeriodicNote } | undefined {
		const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
		if (!file) return undefined;
		const dateNotes = resolveDateNotes(this.settings.dateNotes, periodicPluginSettings(this.app));
		const note = parsePeriodicNote(file, dateNotes, momentFactory);
		return note ? { file, note } : undefined;
	}

	private async syncAgenda(file: TFile, note: PeriodicNote): Promise<void> {
		if (!this.settings.accounts.some((account) => account.enabled)) {
			new Notice(t("noAccountsEnabled"));
			return;
		}
		const { events, failures } = await fetchAgenda(
			obsidianHttp,
			this.settings.accounts,
			(id) => this.app.secretStorage.getSecret(id),
			periodRange(note),
		);
		for (const failure of failures) {
			console.error(`Daily Agenda: could not read "${accountName(failure.account)}"`, failure.error);
			new Notice(failureMessage(failure));
		}
		if (events.length === 0) {
			if (failures.length === 0) new Notice(t("noEvents"));
			return;
		}
		const lines = agendaLines(events, this.settings.templates, note.period, momentFactory);
		if (lines.length === 0) {
			new Notice(t("noTemplateMatches"));
			return;
		}
		let added = 0;
		await this.app.vault.process(file, (content) => {
			const missing = linesMissingFrom(content, lines);
			added = missing.length;
			return appendLines(content, missing);
		});
		new Notice(added === 0 ? t("agendaAlreadyInNote") : tCount("appendedOne", "appendedOther", added));
	}
}

function failureMessage({ account, error }: AccountFailure): string {
	return t("accountFailed", { account: accountName(account), reason: failureReason(error) });
}

function failureReason(error: unknown): string {
	if (error instanceof CalendarError) {
		switch (error.reason) {
			case "missingCredentials":
				return t("reasonMissingCredentials");
			case "authenticationFailed":
				return t("reasonAuthenticationFailed", { status: error.status ?? "", host: hostOf(error.url) });
			case "requestFailed":
				return t("reasonRequestFailed", { status: error.status ?? "", host: hostOf(error.url) });
			case "noPrincipal":
				return t("reasonNoPrincipal");
			case "noCalendarHome":
				return t("reasonNoCalendarHome");
		}
	}
	return t("reasonUnknown", { message: error instanceof Error ? error.message : String(error) });
}

function hostOf(url: string | undefined): string {
	if (url === undefined) return "";
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}
