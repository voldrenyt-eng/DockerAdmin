import { app as enApp } from "./lang/en/app";
import { common as enCommon } from "./lang/en/common";
import { settings as enSettings } from "./lang/en/settings";
import { app as ruApp } from "./lang/ru/app";
import { common as ruCommon } from "./lang/ru/common";
import { settings as ruSettings } from "./lang/ru/settings";
import { app as ukApp } from "./lang/uk/app";
import { common as ukCommon } from "./lang/uk/common";
import { settings as ukSettings } from "./lang/uk/settings";

export const supportedLocales = ["en", "uk", "ru"] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = "en";
export const storageLocaleKey = "dockeradmin.locale";

const localeCatalogs = {
  en: {
    app: enApp,
    common: enCommon,
    settings: enSettings,
  },
  ru: {
    app: ruApp,
    common: ruCommon,
    settings: ruSettings,
  },
  uk: {
    app: ukApp,
    common: ukCommon,
    settings: ukSettings,
  },
} as const;

type TranslationNode = {
  [key: string]: string | TranslationNode;
};

const isTranslationNode = (value: unknown): value is TranslationNode => {
  return typeof value === "object" && value !== null;
};

const readTranslation = (locale: Locale, key: string): string | undefined => {
  const segments = key.split(".");
  let current: string | TranslationNode | undefined = localeCatalogs[locale];

  for (const segment of segments) {
    if (!isTranslationNode(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
};

export const resolveLocale = (value: string | null | undefined): Locale => {
  if (value && supportedLocales.includes(value as Locale)) {
    return value as Locale;
  }

  return defaultLocale;
};

export const getTranslation = (locale: Locale, key: string): string => {
  const localizedValue = readTranslation(locale, key);

  if (localizedValue) {
    return localizedValue;
  }

  const fallbackValue = readTranslation(defaultLocale, key);

  return fallbackValue ?? key;
};

export const readStoredLocale = (
  storage:
    | Pick<Storage, "getItem">
    | {
        getItem: (key: string) => string | null;
      }
    | null
    | undefined,
): Locale => {
  if (!storage) {
    return defaultLocale;
  }

  return resolveLocale(storage.getItem(storageLocaleKey));
};

export const writeStoredLocale = (
  storage:
    | Pick<Storage, "setItem">
    | {
        setItem: (key: string, value: string) => void;
      }
    | null
    | undefined,
  locale: Locale,
): void => {
  storage?.setItem(storageLocaleKey, locale);
};
