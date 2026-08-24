import { useState, type PropsWithChildren } from "react";
import {
  Activity, Bot, Boxes, ClipboardCheck, FileText, FolderKanban, GitBranch, Languages,
  LayoutDashboard, Moon, Settings, Sun, Waypoints,
} from "lucide-react";

import type { AppRoute } from "../app/router";
import { projectRoute } from "../app/router";
import { IconButton, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/i18n";
import { useBridge } from "../bridge/context";

interface AppShellProps {
  readonly route: AppRoute;
  readonly projectName?: string;
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

export function AppShell({ route, projectName, live, navigate, children }: PropsWithChildren<AppShellProps>) {
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
      <button className="wordmark" onClick={() => navigate("/projects")}>
        <img className="wordmark-mark" src="/assets/brand/arka-logo-mark.svg?v=2.1.0" alt="" />
        <span><strong>arka<span>.</span><b>norn</b></strong><small>arkalabs</small></span>
      </button>
      <nav aria-label={t("web.common.primaryNavigation")}>
        <button className={route.section === "projects" ? "nav-item active" : "nav-item"} onClick={() => navigate("/projects")}><FolderKanban size={16} />{t("web.nav.projects")}</button>
        {route.projectId === undefined ? null : <div className="project-navigation">
          <p className="nav-project-name" title={projectName}>{projectName ?? route.projectId}</p>
          {NAVIGATION.map(([section, Icon, label]) => <button key={section} className={route.section === section ? "nav-item active" : "nav-item"} onClick={() => navigate(projectRoute(route.projectId!, section))}><Icon size={16} />{t(label)}</button>)}
        </div>}
      </nav>
      <div className="sidebar-footer"><StatusBadge health={live ? "healthy" : "attention"} label={t(live ? "web.status.connected" : "web.status.disconnected")} /></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>{t("web.nav.projects")}</span>{projectName === undefined ? null : <><b>/</b><strong>{projectName}</strong></>}</div>
        <div className="topbar-actions">
          <IconButton label={locale === "en" ? "FR" : "EN"} onClick={() => {
            const next = locale === "en" ? "fr" : "en";
            setLocale(next);
            void bridge.savePreferences({ locale: next });
          }}><Languages size={17} /></IconButton>
          <IconButton label={t("web.theme.toggle")} onClick={toggleTheme}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</IconButton>
        </div>
      </header>
      <main>{children}</main>
    </div>
  </div>;
}
