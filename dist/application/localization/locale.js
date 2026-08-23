/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { EN_MESSAGES } from "./messages/en.js";
import { FR_MESSAGES } from "./messages/fr.js";
export const SUPPORTED_LOCALES = ["en", "fr"];
const context = new AsyncLocalStorage();
const CATALOGS = {
    en: EN_MESSAGES,
    fr: FR_MESSAGES,
};
export function resolveLocale(input = {}) {
    const override = parseExplicitLocale(input.override, "locale override");
    if (override !== undefined)
        return override;
    const environment = input.environment ?? process.env;
    const fromEnvironment = parseExplicitLocale(environment["ARKA_NORN_LOCALE"], "ARKA_NORN_LOCALE");
    if (fromEnvironment !== undefined)
        return fromEnvironment;
    if (input.preference !== undefined && input.preference !== "auto")
        return input.preference;
    const detected = environment["LC_ALL"]
        ?? environment["LC_MESSAGES"]
        ?? environment["LANG"]
        ?? input.systemLocale
        ?? Intl.DateTimeFormat().resolvedOptions().locale;
    return localeFromLanguageTag(detected);
}
export function parseLocalePreference(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "auto" || normalized === "en" || normalized === "fr")
        return normalized;
    throw new Error(`Unsupported locale preference: ${JSON.stringify(value)}. Expected auto, en or fr.`);
}
export function runWithLocale(locale, operation) {
    return context.run(locale, operation);
}
export function activeLocale() {
    return context.getStore() ?? "en";
}
export function setActiveLocale(locale) {
    context.enterWith(locale);
}
export function translate(key, parameters = {}, locale = activeLocale()) {
    const template = CATALOGS[locale][key];
    return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_placeholder, name) => {
        const value = parameters[name];
        if (value === undefined)
            throw new Error(`Missing translation parameter ${name} for ${key}.`);
        return String(value);
    });
}
export function formatNumber(value, locale = activeLocale()) {
    return new Intl.NumberFormat(locale).format(value);
}
export function formatDate(value, locale = activeLocale()) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value);
}
export function formatShortDate(value, locale = activeLocale()) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(value);
}
export function formatTime(value, locale = activeLocale()) {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(value);
}
export function formatDuration(milliseconds, locale = activeLocale()) {
    const seconds = Math.max(0, milliseconds) / 1_000;
    if (seconds < 60) {
        return new Intl.NumberFormat(locale, { maximumFractionDigits: seconds < 10 ? 1 : 0, style: "unit", unit: "second" }).format(seconds);
    }
    const minutes = seconds / 60;
    if (minutes < 60) {
        return new Intl.NumberFormat(locale, { maximumFractionDigits: minutes < 10 ? 1 : 0, style: "unit", unit: "minute" }).format(minutes);
    }
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, style: "unit", unit: "hour" }).format(minutes / 60);
}
export function formatBytes(value, locale = activeLocale()) {
    const absolute = Math.abs(value);
    const unit = absolute < 1_024 ? "byte" : absolute < 1_048_576 ? "kilobyte" : "megabyte";
    const divisor = unit === "byte" ? 1 : unit === "kilobyte" ? 1_024 : 1_048_576;
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, style: "unit", unit, unitDisplay: "short" }).format(value / divisor);
}
export function plural(value, singular, pluralForm, locale = activeLocale()) {
    return new Intl.PluralRules(locale).select(value) === "one" ? singular : pluralForm;
}
export function assertCatalogParity() {
    const englishKeys = Object.keys(EN_MESSAGES).sort();
    const frenchKeys = Object.keys(FR_MESSAGES).sort();
    if (JSON.stringify(englishKeys) !== JSON.stringify(frenchKeys))
        throw new Error("English and French message keys differ.");
    for (const key of englishKeys) {
        const englishParameters = placeholders(EN_MESSAGES[key]);
        const frenchParameters = placeholders(FR_MESSAGES[key]);
        if (JSON.stringify(englishParameters) !== JSON.stringify(frenchParameters)) {
            throw new Error(`Translation parameters differ for ${key}.`);
        }
    }
}
function parseExplicitLocale(value, source) {
    if (value === undefined || value.trim() === "")
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "en" || normalized === "fr")
        return normalized;
    throw new Error(`Unsupported ${source}: ${JSON.stringify(value)}. Expected en or fr.`);
}
function localeFromLanguageTag(value) {
    const normalized = value.trim().toLowerCase().replace("_", "-");
    return normalized === "fr" || normalized.startsWith("fr-") ? "fr" : "en";
}
function placeholders(template) {
    return [...template.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}
//# sourceMappingURL=locale.js.map