import { useSyncExternalStore } from "react";
import { en } from "./en";
import { zhCN, type TranslationKey } from "./zh-CN";

export type Locale = "zh-CN" | "en";
export type LocaleSetting = "system" | Locale;
export type { TranslationKey };

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  "zh-CN": zhCN,
  en,
};

export const LOCALE_NAMES: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

function detectLocale(): Locale {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function resolveLocale(setting: LocaleSetting): Locale {
  return setting === "system" ? detectLocale() : setting;
}

let current: Locale = detectLocale();
const listeners = new Set<() => void>();

export function setLocale(setting: LocaleSetting): void {
  const next = resolveLocale(setting);
  if (next === current) return;
  current = next;
  document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type TranslationVars = Record<string, string | number>;

/**
 * Translate a key, filling `{name}` placeholders. Falls back to the Chinese
 * string, then the key itself, so a missing translation is never blank.
 */
export function t(key: TranslationKey, vars?: TranslationVars): string {
  const template = DICTIONARIES[current][key] ?? zhCN[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

/** Re-renders the calling component whenever the locale changes. */
export function useTranslation(): {
  t: typeof t;
  locale: Locale;
} {
  const locale = useSyncExternalStore(
    subscribe,
    () => current,
    () => current
  );
  return { t, locale };
}
