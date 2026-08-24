import { lazy, Suspense, useCallback, useState } from "react";

import type { LiveInvalidation, NornBridge, ProjectOverview, WebPreferences } from "../../src/application/web/contracts";
import { documentRoute, useRoute } from "./app/router";
import { BridgeContext, useBridge } from "./bridge/context";
import { DocumentRenderer } from "./components/document-renderer";
import { ErrorState, LoadingState } from "./components/ui";
import { useAsync } from "./hooks/use-async";
import { useLive } from "./hooks/use-live";
import { I18nProvider, useI18n } from "./i18n/i18n";
import { AppShell } from "./layout/app-shell";
import { AgentsView } from "./views/agents-view";
import { AuditsView } from "./views/audits-view";
import { DocumentsView } from "./views/documents-view";
import { FeatureView } from "./views/feature-view";
import { FeaturesView } from "./views/features-view";
import { GovernancePage } from "./views/governance-view";
import { LiveView } from "./views/live-view";
import { ProfileDialog } from "./views/profile-dialog";
import { ProjectOverviewView } from "./views/project-overview";
import { ProjectsView } from "./views/projects-view";
import { SettingsView } from "./views/settings-view";

const RelationshipGraphView = lazy(() => import("./views/relationship-graph"));

export function App({ bridge, initialPreferences }: { readonly bridge: NornBridge; readonly initialPreferences: WebPreferences }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  return <BridgeContext.Provider value={bridge}><I18nProvider initialLocale={preferences.resolvedLocale}><NornApp preferences={preferences} refreshPreferences={() => void bridge.getPreferences().then(setPreferences)} /></I18nProvider></BridgeContext.Provider>;
}

function NornApp({ preferences, refreshPreferences }: { readonly preferences: WebPreferences; readonly refreshPreferences: () => void }) {
  const bridge = useBridge();
  const { route, navigate } = useRoute();
  const [liveRevision, setLiveRevision] = useState(0);
  const onInvalidate = useCallback((event: LiveInvalidation) => setLiveRevision((value) => value + (event.revision > 0 ? 1 : 0)), []);
  const live = useLive(bridge, onInvalidate);
  const project = useAsync(
    async () => route.projectId === undefined ? undefined : bridge.getProject(route.projectId),
    [bridge, route.projectId, liveRevision],
  );
  const content = route.section === "projects"
    ? <ProjectsView navigate={navigate} />
    : route.projectId === undefined || project.loading && project.data === undefined
      ? <LoadingState />
      : project.error !== undefined || project.data === undefined
        ? <ErrorState error={project.error} retry={project.reload} />
        : <ProjectContent projectId={route.projectId} section={route.section} {...(route.featureId === undefined ? {} : { featureId: route.featureId })} {...(route.documentId === undefined ? {} : { documentId: route.documentId })} project={project.data} revision={liveRevision} navigate={navigate} reloadProject={project.reload} preferences={preferences} refreshPreferences={refreshPreferences} />;
  return <AppShell route={route} {...(project.data === undefined ? {} : { project: project.data })} live={live} navigate={navigate}>{content}{preferences.humanProfile === undefined ? <ProfileDialog onSaved={refreshPreferences} /> : null}</AppShell>;
}

function ProjectContent(props: {
  readonly projectId: string;
  readonly section: "overview" | "features" | "documents" | "decisions" | "audits" | "agents" | "live" | "graph" | "settings";
  readonly featureId?: string;
  readonly documentId?: string;
  readonly project: Awaited<ReturnType<NornBridge["getProject"]>>;
  readonly revision: number;
  readonly navigate: (path: string) => void;
  readonly reloadProject: () => void;
  readonly preferences: WebPreferences;
  readonly refreshPreferences: () => void;
}) {
  if (props.featureId !== undefined) {
    return <FeatureContent projectId={props.projectId} featureId={props.featureId} {...(props.documentId === undefined ? {} : { documentId: props.documentId })} revision={props.revision} navigate={props.navigate} />;
  }
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

function FeatureContent({ projectId, featureId, documentId, revision, navigate }: { readonly projectId: string; readonly featureId: string; readonly documentId?: string; readonly revision: number; readonly navigate: (path: string) => void }) {
  const bridge = useBridge();
  const feature = useAsync(() => bridge.getFeature(projectId, featureId), [bridge, projectId, featureId, revision]);
  return dataView(feature, (data) => {
    if (documentId === undefined) return <FeatureView feature={data} navigate={navigate} />;
    const document = data.documents.find((item) => item.id === documentId);
    return document === undefined ? <ErrorState /> : <div className="page"><DocumentRenderer document={document} onOpenDependency={(id) => navigate(documentRoute(projectId, featureId, id))} /></div>;
  });
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
