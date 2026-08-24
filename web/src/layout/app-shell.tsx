import { useState, type PropsWithChildren } from "react";
import {
  Activity, Bot, Boxes, ClipboardCheck, FileText, FolderKanban, GitBranch, Languages,
  Github, LayoutDashboard, Moon, Settings, Star, Sun, Waypoints,
} from "lucide-react";

import type { ProjectOverview } from "../../../src/application/web/contracts";
import type { AppRoute } from "../app/router";
import { projectRoute } from "../app/router";
import { contracts } from "../generated/contracts";
import { useI18n } from "../i18n/i18n";
import { useBridge } from "../bridge/context";

interface AppShellProps {
  readonly route: AppRoute;
  readonly project?: ProjectOverview;
  readonly live: boolean;
  readonly navigate: (path: string) => void;
}

const NAVIGATION = [
  ["overview", LayoutDashboard, "web.nav.overview"],
  ["features", Boxes, "web.nav.features"],
  ["documents", FileText, "web.nav.documents"],
  ["decisions", ClipboardCheck, "web.nav.decisions"],
  ["audits", GitBranch, "web.nav.audits"],
  ["agents", Bot, "web.nav.agents"],
  ["live", Activity, "web.nav.live"],
  ["graph", Waypoints, "web.nav.graph"],
  ["settings", Settings, "web.nav.settings"],
] as const;

export function AppShell({ route, project, live, navigate, children }: PropsWithChildren<AppShellProps>) {
  const { locale, setLocale, t } = useI18n();
  const bridge = useBridge();
  const [theme, setTheme] = useState(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("arka-norn-theme", next);
    setTheme(next);
  };
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="wordmark" title={t("web.nav.projects")} onClick={() => navigate("/projects")}>
        <img className="wordmark-mark" src="/assets/brand/arka-logo-mark.svg" alt="" />
        <span><strong>arka<span>.</span><b>norn</b></strong><small>arkalabs</small></span>
      </button>
      <nav aria-label={t("web.common.primaryNavigation")}>
        <button className={route.section === "projects" ? "nav-item active" : "nav-item"} title={t("web.nav.projects")} onClick={() => navigate("/projects")}><FolderKanban size={15} />{t("web.nav.projects")}</button>
        {route.projectId === undefined ? null : <div className="project-navigation">
          <div className="rail-project"><p title={project?.name}>{project?.name ?? route.projectId}</p><span><b>{contracts.appVersion}</b>{project === undefined ? null : <small>{project.features.reduce((total, feature) => total + feature.documentCount, 0)} {t("web.document.countMany")}</small>}</span></div>
          {NAVIGATION.map(([section, Icon, label]) => {
            const count = navigationCount(section, project);
            return <button key={section} className={route.section === section ? "nav-item active" : "nav-item"} title={t(label)} onClick={() => navigate(projectRoute(route.projectId!, section))}><Icon size={15} /><span>{t(label)}</span>{count === undefined ? null : <small>{count}</small>}</button>;
          })}
        </div>}
      </nav>
      <div className="sidebar-footer">
        <div className={live ? "rail-live connected" : "rail-live"}><i /><strong>{t(live ? "web.status.connected" : "web.status.disconnected")}</strong>{project === undefined ? null : <span>{project.counts.activeOrchestrations} {t("web.nav.live")}</span>}</div>
        <div className="rail-preferences">
          <button aria-label={locale === "en" ? "FR" : "EN"} onClick={() => { const next = locale === "en" ? "fr" : "en"; setLocale(next); void bridge.savePreferences({ locale: next }); }}><Languages size={13} />{locale.toUpperCase()}</button>
          <button aria-label={t("web.theme.toggle")} onClick={toggleTheme}>{theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}<span>{t(theme === "dark" ? "web.theme.light" : "web.theme.dark")}</span></button>
        </div>
        <div className="rail-github">
          <a className="rail-github-repository" href="https://github.com/arka-squad/arka-norn" target="_blank" rel="noreferrer" title={t("web.github.openRepository")}><Github size={16} /><span>GitHub</span></a>
          <a className="rail-github-star" href="https://github.com/arka-squad/arka-norn" target="_blank" rel="noreferrer" aria-label={t("web.github.starRepository")} title={t("web.github.starRepository")}><Star size={15} /></a>
        </div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>{t("web.nav.projects")}</span>{project === undefined ? null : <><b>/</b><strong>{project.name}</strong></>}{route.section === "projects" || project === undefined ? null : <><b>/</b><em>{t(NAVIGATION.find(([section]) => section === route.section)?.[2] ?? "web.nav.overview")}</em></>}</div>
        <div className={live ? "topbar-freshness live" : "topbar-freshness"}><i />{t(live ? "web.live.fresh" : "web.status.disconnected")}</div>
      </header>
      <main><div className="route-stage" key={routeKey(route)}>{children}</div></main>
    </div>
  </div>;
}

function navigationCount(section: typeof NAVIGATION[number][0], project?: ProjectOverview): number | undefined {
  if (project === undefined) return undefined;
  if (section === "features") return project.counts.features;
  if (section === "documents") return project.features.reduce((total, feature) => total + feature.documentCount, 0);
  if (section === "decisions") return project.counts.openDecisions + project.counts.openCorrections;
  if (section === "audits") return project.counts.audits;
  if (section === "live") return project.counts.activeOrchestrations;
  return undefined;
}

function routeKey(route: AppRoute): string {
  return [route.projectId ?? "projects", route.section, route.featureId ?? "", route.documentId ?? ""].join(":");
}
