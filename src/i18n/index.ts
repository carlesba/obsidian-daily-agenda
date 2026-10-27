import { en } from "./en.ts";
import type { Translation, TranslationKey } from "./en.ts";

export type { Translation, TranslationKey } from "./en.ts";

export const DEFAULT_LANGUAGE = "en";

export const TRANSLATIONS: Readonly<Record<string, Translation>> = { en };

export type Placeholders = Record<string, string | number>;

let active: Translation = en;

export function setLanguage(language: string): void {
	active = Object.prototype.hasOwnProperty.call(TRANSLATIONS, language) ? TRANSLATIONS[language] : en;
}

export function t(key: TranslationKey, placeholders?: Placeholders): string {
	const template = active[key] ?? en[key];
	if (!placeholders) return template;
	return template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
		Object.prototype.hasOwnProperty.call(placeholders, name) ? String(placeholders[name]) : match,
	);
}

export function tCount(one: TranslationKey, other: TranslationKey, count: number, placeholders: Placeholders = {}): string {
	return t(count === 1 ? one : other, { ...placeholders, count });
}
