import type { App } from "obsidian";
import type { DateNoteVault } from "./dateNotes";

interface PluginRegistries {
	plugins?: { getPlugin(id: string): { settings?: unknown } | null | undefined };
	internalPlugins?: {
		getPluginById(id: string): { enabled?: boolean; instance?: { options?: unknown } } | null | undefined;
	};
}

export function periodicPluginSettings(app: App): DateNoteVault {
	const registries = app as App & PluginRegistries;
	return {
		periodicNotesSettings: () => readSafely(() => registries.plugins?.getPlugin("periodic-notes")?.settings),
		dailyNotesOptions: () =>
			readSafely(() => {
				const dailyNotes = registries.internalPlugins?.getPluginById("daily-notes");
				return dailyNotes?.enabled ? dailyNotes.instance?.options : undefined;
			}),
	};
}

function readSafely<T>(read: () => T): T | undefined {
	try {
		return read();
	} catch {
		return undefined;
	}
}
