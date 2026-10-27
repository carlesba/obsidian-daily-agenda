import { MarkdownView, Notice, Plugin, getLanguage, moment } from "obsidian";
import type { TFile } from "obsidian";
import { agendaLines, appendLines, linesMissingFrom } from "./agenda/agenda";
import { accountName, fetchAgenda } from "./calendar/accounts";
import type { AccessTokens } from "./calendar/google";
import { PROTOCOL_ACTION } from "./calendar/googleAuth";
import { failureMessage } from "./failureMessages";
import { GoogleSignIn } from "./googleSignIn";
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
	private readonly accessTokens: AccessTokens = new Map();
	private settingTab: DailyAgendaSettingTab | undefined;
	readonly google = new GoogleSignIn({
		app: this.app,
		settings: () => this.settings,
		save: () => this.saveSettings(),
		refreshSettings: () => this.settingTab?.update(),
		tokens: this.accessTokens,
	});

	async onload(): Promise<void> {
		try {
			setLanguage(getLanguage());
		} catch {
			setLanguage(DEFAULT_LANGUAGE);
		}
		this.settings = mergeSettings(await this.loadData());
		this.settingTab = new DailyAgendaSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);
		this.registerObsidianProtocolHandler(PROTOCOL_ACTION, (params) => void this.google.handleRedirect(params));

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
			this.accessTokens,
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
