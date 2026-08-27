import { useState, type FormEvent } from "react";
import { HeartPulse, Monitor, UserRound } from "lucide-react";

import type { WebPreferences } from "../../../src/application/web/contracts";
import { useBridge } from "../bridge/context";
import { DoctorPanel } from "../components/doctor-panel";
import { Button, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function SettingsView({ preferences, onChanged }: { readonly preferences: WebPreferences; readonly onChanged: () => void }) {
  const bridge = useBridge();
  const { locale, setLocale, t } = useI18n();
  const [name, setName] = useState(preferences.humanProfile?.name ?? "");
  const [email, setEmail] = useState(preferences.humanProfile?.email ?? "");
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    await bridge.savePreferences({ name, email });
    onChanged();
  };
  const changeLocale = async (next: "auto" | "en" | "fr") => {
    const saved = await bridge.savePreferences({ locale: next });
    setLocale(saved.resolvedLocale);
    onChanged();
  };
  const changeSurface = async (preferredSurface: "web" | "tui" | "cli") => {
    await bridge.savePreferences({ preferredSurface });
    onChanged();
  };
  return <div className="page"><PageTitle title={t("web.settings.title")} />
    <DoctorPanel />
    <section className="settings-section"><div className="settings-heading"><UserRound size={20} /><div><h2>{t("web.settings.profile")}</h2><p>{t("web.settings.profileSummary")}</p></div></div><form className="settings-form" onSubmit={(event) => void saveProfile(event)}><label>{t("web.settings.name")}<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>{t("web.settings.email")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><Button type="submit" variant="primary">{t("web.action.save")}</Button></form></section>
    <section className="settings-section"><div className="settings-heading"><HeartPulse size={20} /><div><h2>{t("web.settings.locale")}</h2><p>{t("web.settings.system")}: {preferences.resolvedLocale.toUpperCase()}</p></div></div><div className="segmented" role="group" aria-label={t("web.settings.locale")}>{(["auto", "en", "fr"] as const).map((value) => <button key={value} className={preferences.locale === value ? "active" : ""} onClick={() => void changeLocale(value)}>{value === "auto" ? t("web.settings.system") : value.toUpperCase()}</button>)}</div><p className="current-locale">{t("web.settings.display")}: {locale.toUpperCase()}</p></section>
    <section className="settings-section"><div className="settings-heading"><Monitor size={20} /><div><h2>{t("web.settings.surface")}</h2><p>{t("web.settings.surfaceSummary")}</p></div></div><div className="segmented" role="group" aria-label={t("web.settings.surface")}>{(["web", "tui", "cli"] as const).map((value) => <button key={value} className={preferences.preferredSurface === value ? "active" : ""} aria-pressed={preferences.preferredSurface === value} onClick={() => void changeSurface(value)}>{t(`web.settings.surface.${value}`)}</button>)}</div></section>
  </div>;
}
