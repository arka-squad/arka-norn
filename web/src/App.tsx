import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";

import type { FeatureTrackingView, LiveInvalidation, NornBridge, ProjectOverview, WebPreferences } from "../../src/application/web/contracts";
import { documentRoute, framingRoute, projectRoute, routePath, useRoute } from "./app/router";
import { BridgeContext, useBridge } from "./bridge/context";
import { DocumentRenderer } from "./components/document-renderer";
import { EmptyState, ErrorState, LoadingState } from "./components/ui";
import { useAsync } from "./hooks/use-async";
import { useLive } from "./hooks/use-live";
import { I18nProvider, useI18n } from "./i18n/i18n";
import { AppShell } from "./layout/app-shell";
import { isSafeRememberedRoute, resolveRememberedPath } from "./app/navigation-memory";
import { AgentsView } from "./views/agents-view";
import { AuditsView } from "./views/audits-view";
import { DocumentsView } from "./views/documents-view";
import { FeatureView } from "./views/feature-view";
import { FeaturesView } from "./views/features-view";
import { GovernancePage } from "./views/governance-view";
import { LiveView } from "./views/live-view";
import { ProjectOverviewView } from "./views/project-overview";
import { ProjectsView } from "./views/projects-view";
import { SettingsView } from "./views/settings-view";
import { FramingView } from "./views/framing-view";

const RelationshipGraphView = lazy(() => import("./views/relationship-graph"));

export function App({ bridge, initialPreferences }: { readonly bridge: NornBridge; readonly initialPreferences: WebPreferences }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  return <BridgeContext.Provider value={bridge}><I18nProvider initialLocale={preferences.resolvedLocale}><NornApp preferences={preferences} onPreferences={setPreferences} /></I18nProvider></BridgeContext.Provider>;
}

function NornApp({ preferences, onPreferences }: { readonly preferences: WebPreferences; readonly onPreferences: (preferences: WebPreferences) => void }) {
  const bridge = useBridge();
  const { route, navigate } = useRoute();
  const { t } = useI18n();
  const [liveRevision, setLiveRevision] = useState(0);
  const [navigationRecovered, setNavigationRecovered] = useState(false);
  const restorationAttempted = useRef(false);
  const currentPath = routePath(route);
  const refreshPreferences = useCallback(() => { void bridge.getPreferences().then(onPreferences); }, [bridge, onPreferences]);
  const onInvalidate = useCallback((event: LiveInvalidation) => setLiveRevision((value) => value + (event.revision > 0 ? 1 : 0)), []);
  const live = useLive(bridge, onInvalidate);
  const project = useAsync(
    async () => route.projectId === undefined ? undefined : bridge.getProject(route.projectId),
    [bridge, route.projectId, liveRevision],
  );
  useEffect(() => {
    if (route.documentId === undefined) window.scrollTo({ top: 0, behavior: "instant" });
  }, [currentPath, route.documentId]);
  useEffect(() => {
    const saved = preferences.onboarding;
    if (preferences.humanProfile === undefined || saved?.lastRoute === currentPath || route.projectId === undefined) return;
    const timer = setTimeout(() => {
      void bridge.savePreferences({ onboarding: {
        status: "not_started",
        step: 1,
        lastRoute: currentPath,
      } }).then(onPreferences).catch(() => undefined);
    }, 150);
    return () => clearTimeout(timer);
  }, [bridge, currentPath, onPreferences, preferences.humanProfile, preferences.onboarding, route.projectId]);
  useEffect(() => {
    const remembered = preferences.onboarding?.lastRoute;
    if (restorationAttempted.current || currentPath !== "/projects" || !isSafeRememberedRoute(remembered) || remembered === "/projects") return;
    restorationAttempted.current = true;
    void resolveRememberedPath(bridge, remembered).then((result) => {
      setNavigationRecovered(result.recovered);
      navigate(result.path);
    });
  }, [bridge, currentPath, navigate, preferences.onboarding]);
  const content = route.section === "projects"
    ? <ProjectsView navigate={navigate} />
    : route.projectId === undefined || project.loading && project.data === undefined
      ? <LoadingState />
      : project.error !== undefined || project.data === undefined
        ? <ErrorState error={project.error} retry={project.reload} />
        : <ProjectContent projectId={route.projectId} section={route.section} {...(route.featureId === undefined ? {} : { featureId: route.featureId })} {...(route.documentId === undefined ? {} : { documentId: route.documentId })} {...(route.framingId === undefined ? {} : { framingId: route.framingId })} {...(route.framingView === undefined ? {} : { framingView: route.framingView })} project={project.data} revision={liveRevision} navigate={navigate} reloadProject={project.reload} preferences={preferences} refreshPreferences={refreshPreferences} />;
  const shell = <AppShell route={route} {...(project.data === undefined ? {} : { project: project.data })} live={live} navigate={navigate}>
    {navigationRecovered ? <div className="navigation-recovery" role="status">{t("web.navigation.recovered")}</div> : null}
    {content}
  </AppShell>;
  return shell;
}

function ProjectContent(props: {
  readonly projectId: string;
  readonly section: "overview" | "framing" | "features" | "documents" | "decisions" | "audits" | "agents" | "live" | "graph" | "settings";
  readonly featureId?: string;
  readonly documentId?: string;
  readonly framingId?: string;
  readonly framingView?: "plan" | "evidence" | "map" | "history";
  readonly project: Awaited<ReturnType<NornBridge["getProject"]>>;
  readonly revision: number;
  readonly navigate: (path: string) => void;
  readonly reloadProject: () => void;
  readonly preferences: WebPreferences;
  readonly refreshPreferences: () => void;
}) {
  if (props.project.lifecycle === "draft" && props.section !== "overview" && props.section !== "framing") {
    return <DraftUnavailable project={props.project} navigate={props.navigate} />;
  }
  if (props.featureId !== undefined) {
    return <FeatureContent projectId={props.projectId} featureId={props.featureId} {...(props.documentId === undefined ? {} : { documentId: props.documentId })} revision={props.revision} navigate={props.navigate} {...(props.preferences.humanProfile === undefined ? {} : { humanProfileId: props.preferences.humanProfile.id })} />;
  }
  if (props.section === "framing" && props.framingId !== undefined) return <FramingContent projectId={props.projectId} framingId={props.framingId} view={props.framingView ?? "plan"} revision={props.revision} navigate={props.navigate} />;
  if (props.section === "overview") return <ProjectOverviewView project={props.project} navigate={props.navigate} />;
  if (props.section === "features") return <FeaturesView project={props.project} navigate={props.navigate} onCreated={props.reloadProject} />;
  if (props.section === "documents") return <DocumentsContent project={props.project} revision={props.revision} navigate={props.navigate} />;
  if (props.section === "decisions") return <GovernanceContent projectId={props.projectId} revision={props.revision} reloadProject={props.reloadProject} />;
  if (props.section === "agents") return <AgentsContent projectId={props.projectId} revision={props.revision} />;
  if (props.section === "audits") return <AuditsContent project={props.project} revision={props.revision} reloadProject={props.reloadProject} />;
  if (props.section === "live") return <LiveContent projectId={props.projectId} revision={props.revision} />;
  if (props.section === "graph") return <GraphContent project={props.project} revision={props.revision} />;
  return <SettingsView preferences={props.preferences} onChanged={props.refreshPreferences} />;
}

function DraftUnavailable({ project, navigate }: { readonly project: ProjectOverview; readonly navigate: (path: string) => void }) {
  const { t } = useI18n();
  return <div className="page"><EmptyState title={t("web.project.draftTitle")} description={t("web.project.markerRequired")} icon={<LockKeyhole size={17} />} action={<button className="button primary" onClick={() => navigate(project.framing === undefined ? projectRoute(project.id) : framingRoute(project.id, project.framing.framingId))}>{t("web.action.continueFraming")}</button>} /></div>;
}

function FramingContent({ projectId, framingId, view, revision, navigate }: { readonly projectId: string; readonly framingId: string; readonly view: "plan" | "evidence" | "map" | "history"; readonly revision: number; readonly navigate: (path: string) => void }) {
  const bridge = useBridge();
  const framing = useAsync(() => bridge.getFraming(projectId, framingId), [bridge, projectId, framingId, revision]);
  return dataView(framing, (data) => <FramingView projectId={projectId} framing={data} view={view} navigate={navigate} />);
}

function FeatureContent({ projectId, featureId, documentId, revision, navigate, humanProfileId }: { readonly projectId: string; readonly featureId: string; readonly documentId?: string; readonly revision: number; readonly navigate: (path: string) => void; readonly humanProfileId?: string }) {
  const bridge = useBridge();
  const feature = useAsync(async () => {
    const [tracking, continuation] = await Promise.all([
      bridge.getFeature(projectId, featureId),
      bridge.getFeatureContinuation(projectId, featureId),
    ]);
    return { tracking, continuation };
  }, [bridge, projectId, featureId, revision]);
  return dataView(feature, (data) => {
    if (documentId === undefined) return <FeatureView feature={data.tracking} continuation={data.continuation} navigate={navigate} />;
    const document = data.tracking.documents.find((item) => item.id === documentId);
    return document === undefined ? <ErrorState /> : <DocumentReadingView document={document} projectId={projectId} featureId={featureId} {...(humanProfileId === undefined ? {} : { humanProfileId })} navigate={navigate} />;
  });
}

function DocumentReadingView({ document, projectId, featureId, humanProfileId, navigate }: { readonly document: FeatureTrackingView["documents"][number]; readonly projectId: string; readonly featureId: string; readonly humanProfileId?: string; readonly navigate: (path: string) => void }) {
  const path = documentRoute(projectId, featureId, document.id);
  useEffect(() => {
    const key = humanProfileId === undefined ? undefined : `arka-norn-reading:${humanProfileId}:${path}`;
    const saved = key === undefined ? 0 : Number(localStorage.getItem(key));
    const timer = setTimeout(() => window.scrollTo({ top: Number.isFinite(saved) ? saved : 0, behavior: "instant" }), 0);
    return () => {
      clearTimeout(timer);
      if (key !== undefined) localStorage.setItem(key, String(Math.max(0, Math.round(window.scrollY))));
    };
  }, [humanProfileId, path]);
  return <div className="page"><DocumentRenderer document={document} onOpenDependency={(id) => navigate(documentRoute(projectId, featureId, id))} /></div>;
}

function DocumentsContent({ project, revision, navigate }: { readonly project: ProjectOverview; readonly revision: number; readonly navigate: (path: string) => void }) {
  const bridge = useBridge();
  const features = useAsync(() => Promise.all(project.features.map((item) => bridge.getFeature(project.id, item.id))), [bridge, project.id, project.features, revision]);
  return dataView(features, (data) => <DocumentsView project={project} features={data} navigate={navigate} />);
}

function GovernanceContent({ projectId, revision, reloadProject }: { readonly projectId: string; readonly revision: number; readonly reloadProject: () => void }) {
  const bridge = useBridge();
  const governance = useAsync(() => bridge.getGovernance(projectId), [bridge, projectId, revision]);
  return dataView(governance, (data) => <GovernancePage projectId={projectId} governance={data} onChanged={() => { governance.reload(); reloadProject(); }} />);
}

function AgentsContent({ projectId, revision }: { readonly projectId: string; readonly revision: number }) {
  const bridge = useBridge();
  const agents = useAsync(() => bridge.getAgents(projectId), [bridge, projectId, revision]);
  return dataView(agents, (data) => <AgentsView agents={data} />);
}

function AuditsContent({ project, revision, reloadProject }: { readonly project: ProjectOverview; readonly revision: number; readonly reloadProject: () => void }) {
  const bridge = useBridge();
  const audits = useAsync(() => bridge.getAudits(project.id), [bridge, project.id, revision]);
  return dataView(audits, (data) => <AuditsView projectId={project.id} features={project.features} audits={data} onChanged={() => { audits.reload(); reloadProject(); }} />);
}

function LiveContent({ projectId, revision }: { readonly projectId: string; readonly revision: number }) {
  const bridge = useBridge();
  const orchestrations = useAsync(() => bridge.getOrchestrations(projectId), [bridge, projectId, revision]);
  return dataView(orchestrations, (data) => <LiveView orchestrations={data} />);
}

function GraphContent({ project, revision }: { readonly project: ProjectOverview; readonly revision: number }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [featureId, setFeatureId] = useState(project.features[0]?.id ?? "all");
  const graph = useAsync(() => bridge.getGraph(project.id, featureId === "all" ? undefined : featureId), [bridge, project.id, featureId, revision]);
  const control = <label className="graph-filter"><span>{t("web.graph.scope")}</span><select value={featureId} onChange={(event) => setFeatureId(event.target.value)}><option value="all">{t("web.graph.allProject")}</option>{project.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name}</option>)}</select></label>;
  return dataView(graph, (data) => <Suspense fallback={<LoadingState />}><RelationshipGraphView graph={data} scopeControl={control} /></Suspense>);
}

function dataView<T>(state: { readonly data?: T; readonly loading: boolean; readonly error?: Error; readonly reload: () => void }, render: (data: T) => React.ReactNode): React.ReactNode {
  if (state.loading && state.data === undefined) return <LoadingState />;
  if (state.error !== undefined || state.data === undefined) return <ErrorState error={state.error} retry={state.reload} />;
  return render(state.data);
}
