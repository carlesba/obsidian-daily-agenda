import { App, Notice, PluginSettingTab, debounce } from "obsidian";
import type { SettingDefinitionGroup, SettingDefinitionItem, SettingDefinitionList, SettingDefinitionPage } from "obsidian";
import { t } from "./i18n";
import type DailyAgendaPlugin from "./main";
import type { DateNoteVault } from "./periodic/dateNotes";
import { periodicPluginSettings } from "./periodic/obsidianPlugins";
import { newAccount, newTemplate } from "./settings";
import { DATE_NOTE_SOURCE_KEY, TYPED_FIELDS, periodKey, readControl, writeControl } from "./settings/controlKeys";
import { customPeriods, dateNoteSourceDescription, dateNoteSourceOptions, formatError, periodName } from "./settings/dateNotesForm";
import { accountPage, accountPageId, accountRow, templatePage, templatePageId, templateRow } from "./settings/pages";
import type { PageContext } from "./settings/pages";

const TYPING_PAUSE_MS = 800;

const DATE_NOTE_FORMATS_PAGE_ID = "date-note-formats";

interface SettingModal {
	openPagePath?: (tabId: string, path: string[]) => unknown;
}

interface AppWithSettingModal {
	setting?: SettingModal;
}

export class DailyAgendaSettingTab extends PluginSettingTab {
	private plugin: DailyAgendaPlugin;
	private readonly refreshAfterTyping = debounce(() => this.update(), TYPING_PAUSE_MS, true);

	constructor(app: App, plugin: DailyAgendaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const { settings } = this.plugin;
		const { accounts, templates } = settings;
		const vault = periodicPluginSettings(this.app);
		const context: PageContext = {
			app: this.app,
			settings,
			write: (key, value) => void this.setControlValue(key, value),
			openPage: (pageId) => this.openPage(pageId),
		};
		return [
			this.dateNotesSection(vault, context),
			{
				type: "list",
				heading: t("accounts"),
				emptyState: t("noAccountsYet"),
				items: accounts.map((account) => accountRow(account, context)),
				...this.editableEntries(accounts),
				addItem: {
					name: t("addAccount"),
					action: () => {
						const account = newAccount(accounts);
						this.change(() => accounts.push(account));
						this.openPage(accountPageId(account));
					},
				},
			},
			{
				type: "list",
				heading: t("templates"),
				emptyState: t("noTemplatesYet"),
				items: templates.map((template) => templateRow(template, context)),
				...this.editableEntries(templates),
				addItem: {
					name: t("addTemplate"),
					action: () => {
						const template = newTemplate(templates);
						this.change(() => templates.push(template));
						this.openPage(templatePageId(template));
					},
				},
			},
			{
				type: "group",
				items: [{ name: t("templateMatching"), desc: t("templatesDesc") }],
			},
			{
				type: "group",
				visible: false,
				items: [
					...accounts.map((account) => accountPage(account, context)),
					...templates.map((template) => templatePage(template, context)),
					this.dateNoteFormatsPage(vault),
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		return readControl(this.plugin.settings, key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (!writeControl(this.plugin.settings, key, value)) return;
		await this.plugin.saveSettings();
		const field = key.split("/").pop() ?? "";
		if (TYPED_FIELDS.includes(field)) {
			this.refreshAfterTyping();
			return;
		}
		this.refreshDomState();
		this.update();
	}

	private openPage(pageId: string): void {
		const modal = (this.app as unknown as AppWithSettingModal).setting;
		if (typeof modal?.openPagePath !== "function") {
			new Notice(t("needsNewerObsidian"));
			return;
		}
		modal.openPagePath(this.plugin.manifest.id, [pageId]);
	}

	private editableEntries(entries: unknown[]): Pick<SettingDefinitionList, "onReorder" | "onDelete"> {
		return {
			onReorder: (from, to) => this.change(() => entries.splice(to, 0, ...entries.splice(from, 1))),
			onDelete: (index) => this.change(() => entries.splice(index, 1)),
		};
	}

	private change(change: () => unknown): void {
		change();
		void this.plugin.saveSettings();
		this.update();
	}

	private dateNotesSection(vault: DateNoteVault, context: PageContext): SettingDefinitionGroup {
		const { dateNotes } = this.plugin.settings;
		return {
			type: "group",
			heading: t("periodicNotes"),
			items: [
				{
					name: t("readFrom"),
					desc: dateNoteSourceDescription(dateNotes, vault),
					render: (setting) => {
						setting.addDropdown((dropdown) =>
							dropdown
								.addOptions(dateNoteSourceOptions())
								.setValue(dateNotes.from)
								.onChange((from) => context.write(DATE_NOTE_SOURCE_KEY, from)),
						);
						if (customPeriods(dateNotes, vault).length === 0) return;
						setting.addExtraButton((button) =>
							button
								.setIcon("pencil")
								.setTooltip(t("editFormats"))
								.onClick(() => context.openPage(DATE_NOTE_FORMATS_PAGE_ID)),
						);
					},
				},
			],
		};
	}

	private dateNoteFormatsPage(vault: DateNoteVault): SettingDefinitionPage {
		const page: SettingDefinitionPage & { id: string } = {
			type: "page",
			id: DATE_NOTE_FORMATS_PAGE_ID,
			name: t("dateNoteFormats"),
			items: customPeriods(this.plugin.settings.dateNotes, vault).map((period) => ({
				type: "group" as const,
				heading: periodName(period),
				items: [
					{ name: t("enabled"), control: { type: "toggle" as const, key: periodKey(period, "enabled") } },
					{ name: t("folder"), control: { type: "folder" as const, key: periodKey(period, "folder"), includeRoot: true } },
					{
						name: t("format"),
						desc: t("formatDesc"),
						control: { type: "text" as const, key: periodKey(period, "format"), validate: formatError },
					},
				],
			})),
		};
		return page;
	}
}
