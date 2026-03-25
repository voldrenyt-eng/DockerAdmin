import {
  type PropsWithChildren,
  createContext,
  use,
  useEffect,
  useState,
} from "react";

import {
  type Locale,
  defaultLocale,
  getTranslation,
  readStoredLocale,
  resolveLocale,
  supportedLocales,
  writeStoredLocale,
} from "./i18n";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const getBrowserStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
};

export const LanguageProvider = ({ children }: PropsWithChildren) => {
  const [locale, setLocale] = useState<Locale>(() => {
    return readStoredLocale(getBrowserStorage());
  });

  useEffect(() => {
    writeStoredLocale(getBrowserStorage(), locale);
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext
      value={{
        locale,
        setLocale: (nextLocale) => {
          setLocale(resolveLocale(nextLocale));
        },
        t: (key) => getTranslation(locale, key),
      }}
    >
      {children}
    </I18nContext>
  );
};

export const useI18n = (): I18nContextValue => {
  const context = use(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside LanguageProvider");
  }

  return context;
};

export { defaultLocale, supportedLocales, type Locale };
