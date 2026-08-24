import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { catalogs } from "../generated/catalogs";

export type WebLocale = "en" | "fr";
type MessageKey = keyof typeof catalogs.en;

interface I18nValue {
  readonly locale: WebLocale;
  readonly setLocale: (locale: WebLocale) => void;
  readonly t: (key: MessageKey) => string;
  readonly contractLabel: (field: string) => string;
  readonly date: (value: string | Date) => string;
  readonly duration: (milliseconds: number) => string;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({ initialLocale, children }: PropsWithChildren<{ readonly initialLocale: WebLocale }>) {
  const [locale, setLocaleState] = useState(initialLocale);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale(next) {
      localStorage.setItem("arka-norn-locale", next);
      document.documentElement.lang = next;
      setLocaleState(next);
    },
    t: (key) => catalogs[locale][key],
    contractLabel: (field) => {
      const key = `web.contract.${field}`;
      const translated = (catalogs[locale] as Readonly<Record<string, string>>)[key];
      return translated ?? field.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    },
    date: (input) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(input)),
    duration: (milliseconds) => new Intl.NumberFormat(locale, { style: "unit", unit: milliseconds < 60_000 ? "second" : "minute", maximumFractionDigits: 1 }).format(milliseconds < 60_000 ? milliseconds / 1_000 : milliseconds / 60_000),
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value === undefined) throw new Error("I18n context is unavailable.");
  return value;
}

export function detectedLocale(preferred?: string): WebLocale {
  const stored = localStorage.getItem("arka-norn-locale");
  const candidate = stored ?? preferred ?? navigator.language;
  return candidate.toLowerCase().startsWith("fr") ? "fr" : "en";
}
