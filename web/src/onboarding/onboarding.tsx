import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { ArrowLeft, Check, CheckCircle2, FolderKanban, Info, ShieldCheck, Sparkles, UserRound } from "lucide-react";

import type { FeatureTrackingView, ProjectListItem, ProjectOverview, WebPreferences } from "../../../src/application/web/contracts";
import type { WebOnboardingDraft, WebOnboardingProgress, WebOnboardingStep } from "../../../src/domain/onboarding/web-onboarding-state";
import { featureRoute } from "../app/router";
import { useBridge } from "../bridge/context";
import { AdvancedFields, FieldHint, FolderPickerField, FormError } from "../components/guided-form";
import { Button, StatusBadge } from "../components/ui";
import { contracts } from "../generated/contracts";
import { useI18n } from "../i18n/i18n";
import { featureRoot, freshProgress, pipelineName, slug } from "./onboarding-model";

interface OnboardingProps {
  readonly preferences: WebPreferences;
  readonly projects: readonly ProjectListItem[];
  readonly initialStep: WebOnboardingStep;
  readonly initialProgress?: WebOnboardingProgress;
  readonly recovery: "none" | "project_missing" | "owner_changed";
  readonly onPreferences: (preferences: WebPreferences) => void;
  readonly onPause: () => void;
  readonly navigate: (path: string) => void;
}

const STEP_KEYS = [
  "web.onboarding.step.identity",
  "web.onboarding.step.project",
  "web.onboarding.step.feature",
  "web.onboarding.step.summary",
] as const;

const PIPELINE_COPY = {
  "arka-norn-fastdev": ["web.onboarding.pipeline.fastdev.detail", "web.onboarding.pipeline.fastdev.why"],
  "arka-norn-essential": ["web.onboarding.pipeline.essential.detail", "web.onboarding.pipeline.essential.why"],
  "arka-norn-complete": ["web.onboarding.pipeline.complete.detail", "web.onboarding.pipeline.complete.why"],
  "arka-norn-essential-2.3": ["web.onboarding.pipeline.essential.detail", "web.onboarding.pipeline.essential.why"],
  "arka-norn-complete-2.3": ["web.onboarding.pipeline.complete.detail", "web.onboarding.pipeline.complete.why"],
} as const;

export function Onboarding(props: OnboardingProps) {
  const bridge = useBridge();
  const { t, contractLabel } = useI18n();
  const humanProfileId = props.preferences.humanProfile?.id;
  const [step, setStep] = useState<WebOnboardingStep>(props.initialStep);
  const [progress, setProgress] = useState<WebOnboardingProgress>(() => props.initialProgress ?? freshProgress(props.initialStep));
  const [projects, setProjects] = useState<readonly ProjectListItem[]>(props.projects);
  const [name, setName] = useState(props.preferences.humanProfile?.name ?? "");
  const [email, setEmail] = useState(props.preferences.humanProfile?.email ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState(progress.projectId ?? "");
  const [projectName, setProjectName] = useState(progress.draft?.projectName ?? "");
  const [projectId, setProjectId] = useState(progress.draft?.projectId ?? "");
  const [projectRoot, setProjectRoot] = useState(progress.draft?.projectRoot ?? "");
  const [featureName, setFeatureName] = useState(progress.draft?.featureName ?? "");
  const [featureId, setFeatureId] = useState(progress.draft?.featureId ?? "");
  const [pipelineId, setPipelineId] = useState(progress.draft?.pipelineId ?? contracts.defaultPipelineId);
  const [feature, setFeature] = useState<FeatureTrackingView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [operation, setOperation] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftHydrated = useRef(false);

  const selectedProject = useMemo(() => {
    const id = progress.projectId ?? selectedProjectId;
    return projects.find((candidate) => candidate.id === id) ?? (progress.draft?.projectRoot === undefined || id.length === 0 ? undefined : {
      id,
      name: progress.draft.projectName ?? id,
      root: progress.draft.projectRoot,
      featureCount: 0,
      health: "healthy" as const,
      updatedAt: new Date(0).toISOString(),
    });
  }, [progress, projects, selectedProjectId]);

  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => () => { if (draftTimer.current !== undefined) clearTimeout(draftTimer.current); }, []);
  useEffect(() => {
    if (step === 1 || humanProfileId === undefined) return;
    if (!draftHydrated.current) { draftHydrated.current = true; return; }
    if (draftTimer.current !== undefined) clearTimeout(draftTimer.current);
    const next = withDraft(progress, { projectName, projectId, projectRoot, featureName, featureId, pipelineId });
    setProgress(next);
    draftTimer.current = setTimeout(() => {
      void bridge.savePreferences({ onboarding: next }).then(props.onPreferences).catch(() => undefined);
    }, 300);
  }, [bridge, featureId, featureName, humanProfileId, pipelineId, progress.projectId, projectId, projectName, projectRoot, props.onPreferences, step]);

  useEffect(() => {
    if (step !== 4 || progress.projectId === undefined || progress.featureId === undefined || feature !== undefined) return;
    let active = true;
    void bridge.getFeature(progress.projectId, progress.featureId)
      .then((value) => { if (active) setFeature(value); })
      .catch(() => { if (active) setError(t("web.onboarding.error")); });
    return () => { active = false; };
  }, [bridge, feature, progress.featureId, progress.projectId, step, t]);

  const persist = async (next: WebOnboardingProgress): Promise<void> => {
    if (draftTimer.current !== undefined) clearTimeout(draftTimer.current);
    const saved = await bridge.savePreferences({ onboarding: next });
    setProgress(next);
    setStep(next.step);
    props.onPreferences(saved);
  };

  const submitIdentity = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length === 0) return;
    setBusy(true);
    setOperation(t("web.onboarding.saving"));
    setError(undefined);
    try {
      const next = withDraft(freshProgress(2), { projectName, projectId, projectRoot, featureName, featureId, pipelineId });
      const saved = await bridge.savePreferences({ name: name.trim(), email: email.trim(), onboarding: next });
      setProgress(next);
      setStep(2);
      props.onPreferences(saved);
    } catch { setError(t("web.onboarding.error")); }
    finally { setBusy(false); setOperation(undefined); }
  };

  const submitProject = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setOperation(t("web.onboarding.connecting"));
    setError(undefined);
    try {
      let overview: ProjectOverview;
      if (selectedProjectId.length > 0) overview = await bridge.getProject(selectedProjectId);
      else {
        if (projectName.trim().length === 0 || projectId.length === 0 || projectRoot.length === 0) return;
        overview = await bridge.createProject({ id: projectId, name: projectName.trim(), root: projectRoot });
      }
      const item: ProjectListItem = {
        id: overview.id,
        name: overview.name,
        root: overview.root,
        featureCount: overview.counts.features,
        health: overview.health,
        updatedAt: overview.freshness.observedAt,
      };
      setProjects((current) => [...current.filter((candidate) => candidate.id !== item.id), item]);
      setSelectedProjectId(item.id);
      setProjectName(item.name);
      setProjectId(item.id);
      setProjectRoot(item.root);
      await persist({
        status: "in_progress",
        step: 3,
        projectId: item.id,
        draft: { projectName: item.name, projectId: item.id, projectRoot: item.root, featureName, featureId, pipelineId },
      });
    } catch { setError(t("web.onboarding.error")); }
    finally { setBusy(false); setOperation(undefined); }
  };

  const submitFeature = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedProject === undefined || featureName.trim().length === 0 || featureId.length === 0) return;
    setBusy(true);
    setOperation(t("web.onboarding.creating"));
    setError(undefined);
    try {
      const created = await bridge.createFeature(selectedProject.id, {
        id: featureId,
        name: featureName.trim(),
        root: featureRoot(selectedProject.root, featureId),
        pipelineId,
      });
      setFeature(created);
      await persist({
        status: "in_progress",
        step: 4,
        projectId: selectedProject.id,
        featureId: created.id,
        draft: { projectName: selectedProject.name, projectId: selectedProject.id, projectRoot: selectedProject.root, featureName: created.name, featureId: created.id, pipelineId: created.pipelineId },
        lastRoute: featureRoute(selectedProject.id, created.id),
      });
    } catch { setError(t("web.onboarding.error")); }
    finally { setBusy(false); setOperation(undefined); }
  };

  const finish = async () => {
    if (progress.projectId === undefined || progress.featureId === undefined) return;
    setBusy(true);
    setOperation(t("web.onboarding.saving"));
    setError(undefined);
    try {
      const path = featureRoute(progress.projectId, progress.featureId);
      const saved = await bridge.savePreferences({ onboarding: { ...progress, status: "completed", step: 4, lastRoute: path } });
      props.navigate(path);
      props.onPreferences(saved);
    } catch { setError(t("web.onboarding.error")); setBusy(false); setOperation(undefined); }
  };

  const goBack = () => {
    const previous = Math.max(1, step - 1) as WebOnboardingStep;
    const next = { ...progress, status: "in_progress" as const, step: previous };
    setProgress(next);
    setStep(previous);
    if (props.preferences.humanProfile !== undefined) void bridge.savePreferences({ onboarding: next }).then(props.onPreferences).catch(() => undefined);
  };

  const pause = async () => {
    const next = withDraft(progress, { projectName, projectId, projectRoot, featureName, featureId, pipelineId });
    if (draftTimer.current !== undefined) clearTimeout(draftTimer.current);
    try { props.onPreferences(await bridge.savePreferences({ onboarding: next })); }
    finally { props.onPause(); }
  };

  return <div className="onboarding-shell" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <header className="onboarding-brand">
      <img src="/assets/brand/arka-logo-mark.svg" alt="" />
      <span><strong>arka.<b>norn</b></strong><small>{t("web.onboarding.eyebrow")}</small></span>
    </header>
    <aside className="onboarding-rail">
      <div><span>{t("web.onboarding.eyebrow")}</span><h1 id="onboarding-title">{t("web.onboarding.title")}</h1><p>{t("web.onboarding.promise")}</p></div>
      <ol aria-label={t("web.onboarding.progress")}>{STEP_KEYS.map((key, index) => {
        const number = index + 1 as WebOnboardingStep;
        return <li key={key} className={number === step ? "current" : number < step ? "complete" : ""} aria-current={number === step ? "step" : undefined}>
          <i>{number < step ? <Check size={14} /> : number}</i><span><small>{String(number).padStart(2, "0")}</small><strong>{t(key)}</strong></span>
        </li>;
      })}</ol>
      {step > 1 ? <Button variant="ghost" onClick={() => void pause()}>{t("web.action.resumeLater")}</Button> : null}
    </aside>
    <main className="onboarding-stage">
      {props.recovery === "none" ? null : <div className="onboarding-recovery" role="status"><Info size={17} /><span>{t(props.recovery === "project_missing" ? "web.onboarding.recovery.projectMissing" : "web.onboarding.recovery.ownerChanged")}</span></div>}
      {step === 1 ? <IdentityStep name={name} email={email} busy={busy} error={error} heading={heading} onName={setName} onEmail={setEmail} onSubmit={(event) => void submitIdentity(event)} /> : null}
      {step === 2 ? <ProjectStep projects={projects} selectedProjectId={selectedProjectId} projectName={projectName} projectId={projectId} projectRoot={projectRoot} busy={busy} error={error} heading={heading} onSelect={(id) => { setSelectedProjectId(id); setError(undefined); }} onName={(value) => { const previousSlug = slug(projectName); setProjectName(value); if (projectId.length === 0 || projectId === previousSlug) setProjectId(slug(value)); setSelectedProjectId(""); }} onId={setProjectId} onRoot={(root) => { setProjectRoot(root); setSelectedProjectId(""); }} onError={setError} onSubmit={(event) => void submitProject(event)} /> : null}
      {step === 3 && selectedProject !== undefined ? <FeatureStep project={selectedProject} name={featureName} id={featureId} pipelineId={pipelineId} busy={busy} error={error} heading={heading} onName={(value) => { const previousSlug = slug(featureName); setFeatureName(value); if (featureId.length === 0 || featureId === previousSlug) setFeatureId(slug(value)); }} onId={setFeatureId} onPipeline={setPipelineId} onSubmit={(event) => void submitFeature(event)} /> : null}
      {step === 4 ? <SummaryStep project={selectedProject} feature={feature} busy={busy} error={error} heading={heading} onFinish={() => void finish()} contractLabel={contractLabel} /> : null}
      {operation === undefined ? null : <div className="onboarding-operation" role="status"><Sparkles className="spin" size={17} />{operation}</div>}
      {step > 1 && step < 4 ? <button className="onboarding-back" type="button" onClick={goBack} disabled={busy}><ArrowLeft size={15} />{t("web.action.back")}</button> : null}
    </main>
  </div>;
}

function IdentityStep(props: { readonly name: string; readonly email: string; readonly busy: boolean; readonly error: string | undefined; readonly heading: RefObject<HTMLHeadingElement | null>; readonly onName: (value: string) => void; readonly onEmail: (value: string) => void; readonly onSubmit: (event: FormEvent) => void }) {
  const { t } = useI18n();
  return <StepFrame icon={<UserRound size={20} />} question={t("web.onboarding.identity.question")} detail={t("web.onboarding.identity.detail")} heading={props.heading}>
    <form className="onboarding-form" onSubmit={props.onSubmit}>
      <label>{t("web.settings.name")}<input autoComplete="name" required maxLength={120} value={props.name} onChange={(event) => props.onName(event.target.value)} /></label>
      <label>{t("web.settings.email")}<input autoComplete="email" type="email" maxLength={254} value={props.email} onChange={(event) => props.onEmail(event.target.value)} /></label>
      <div className="onboarding-note"><ShieldCheck size={17} /><span>{t("web.onboarding.identity.note")}</span></div>
      <FormError message={props.error} />
      <Button type="submit" variant="primary" disabled={props.busy || props.name.trim().length === 0}>{t("web.action.continue")}</Button>
    </form>
  </StepFrame>;
}

function ProjectStep(props: { readonly projects: readonly ProjectListItem[]; readonly selectedProjectId: string; readonly projectName: string; readonly projectId: string; readonly projectRoot: string; readonly busy: boolean; readonly error: string | undefined; readonly heading: RefObject<HTMLHeadingElement | null>; readonly onSelect: (id: string) => void; readonly onName: (value: string) => void; readonly onId: (value: string) => void; readonly onRoot: (root: string) => void; readonly onError: (message: string | undefined) => void; readonly onSubmit: (event: FormEvent) => void }) {
  const { t } = useI18n();
  const canSubmit = props.selectedProjectId.length > 0 || props.projectName.trim().length > 0 && props.projectId.length > 0 && props.projectRoot.length > 0;
  return <StepFrame icon={<FolderKanban size={20} />} question={t("web.onboarding.project.question")} detail={t("web.onboarding.project.detail")} heading={props.heading}>
    <form className="onboarding-form" onSubmit={props.onSubmit}>
      {props.projects.length === 0 ? null : <section className="onboarding-projects"><h3>{t("web.onboarding.project.existing")}</h3>{props.projects.map((project) => <label key={project.id} className={props.selectedProjectId === project.id ? "selected" : ""}>
        <input type="radio" name="onboarding-project" checked={props.selectedProjectId === project.id} onChange={() => props.onSelect(project.id)} />
        <FolderKanban size={18} /><span><strong>{project.name}</strong><small>{project.root}</small></span>{props.selectedProjectId === project.id ? <CheckCircle2 size={17} /> : null}
      </label>)}</section>}
      <div className="onboarding-form-divider"><span>{t("web.onboarding.project.new")}</span></div>
      <label>{t("web.form.name")}<input required={props.selectedProjectId.length === 0} maxLength={256} value={props.projectName} onChange={(event) => props.onName(event.target.value)} /><FieldHint>{t("web.projects.nameHint")}</FieldHint></label>
      <FolderPickerField label={t("web.form.root")} hint={t("web.projects.folderHint")} purpose="project" value={props.projectRoot} onChange={props.onRoot} onError={props.onError} />
      <AdvancedFields label={t("web.form.technicalDetails")}><label>{t("web.form.id")}<input required={props.selectedProjectId.length === 0} pattern="[a-z0-9][a-z0-9-]{0,63}" value={props.projectId} onChange={(event) => props.onId(event.target.value)} /></label></AdvancedFields>
      <div className="onboarding-note"><Info size={17} /><span>{t("web.onboarding.project.inspect")}</span></div>
      <FormError message={props.error} />
      <Button type="submit" variant="primary" disabled={props.busy || !canSubmit}>{props.selectedProjectId.length > 0 ? t("web.action.useProject") : t("web.action.registerProject")}</Button>
    </form>
  </StepFrame>;
}

function FeatureStep(props: { readonly project: ProjectListItem; readonly name: string; readonly id: string; readonly pipelineId: string; readonly busy: boolean; readonly error: string | undefined; readonly heading: RefObject<HTMLHeadingElement | null>; readonly onName: (value: string) => void; readonly onId: (value: string) => void; readonly onPipeline: (value: string) => void; readonly onSubmit: (event: FormEvent) => void }) {
  const { t } = useI18n();
  return <StepFrame icon={<Sparkles size={20} />} question={t("web.onboarding.feature.question")} detail={t("web.onboarding.feature.detail")} heading={props.heading}>
    <form className="onboarding-form" onSubmit={props.onSubmit}>
      <label>{t("web.form.name")}<input required maxLength={256} value={props.name} onChange={(event) => props.onName(event.target.value)} /><FieldHint>{t("web.feature.nameHint")}</FieldHint></label>
      <div className="onboarding-path"><small>{t("web.onboarding.feature.path")}</small><code>{props.id.length === 0 ? "—" : featureRoot(props.project.root, props.id)}</code></div>
      <div className="onboarding-workflows"><h3>{t("web.onboarding.feature.workflow")}</h3>{contracts.pipelines.map((pipeline) => {
        const copy = PIPELINE_COPY[pipeline.id];
        const selected = pipeline.id === props.pipelineId;
        return <label key={pipeline.id} className={selected ? "selected" : ""}>
          <input type="radio" name="onboarding-workflow" checked={selected} onChange={() => props.onPipeline(pipeline.id)} />
          <span><strong>{pipeline.name}</strong>{pipeline.id === contracts.defaultPipelineId ? <em>{t("web.onboarding.feature.recommended")}</em> : null}</span>
          <p>{t(copy[0])}</p><small>{t(copy[1])}</small>
        </label>;
      })}</div>
      <AdvancedFields label={t("web.form.technicalDetails")}><label>{t("web.form.id")}<input required pattern="[a-z0-9][a-z0-9-]{0,63}" value={props.id} onChange={(event) => props.onId(event.target.value)} /></label></AdvancedFields>
      <FormError message={props.error} />
      <Button type="submit" variant="primary" disabled={props.busy || props.name.trim().length === 0 || props.id.length === 0}>{t("web.action.addFeature")}</Button>
    </form>
  </StepFrame>;
}

function SummaryStep(props: { readonly project: ProjectListItem | undefined; readonly feature: FeatureTrackingView | undefined; readonly busy: boolean; readonly error: string | undefined; readonly heading: RefObject<HTMLHeadingElement | null>; readonly onFinish: () => void; readonly contractLabel: (value: string) => string }) {
  const { t } = useI18n();
  return <StepFrame icon={<CheckCircle2 size={20} />} question={t("web.onboarding.summary.question")} detail={t("web.onboarding.summary.detail")} heading={props.heading}>
    {props.feature === undefined || props.project === undefined ? <div className="onboarding-summary-loading">{t("web.common.loading")}</div> : <dl className="onboarding-summary">
      <div><dt>{t("web.onboarding.summary.project")}</dt><dd>{props.project.name}<small>{props.project.root}</small></dd></div>
      <div><dt>{t("web.onboarding.summary.feature")}</dt><dd>{props.feature.name}<StatusBadge health={props.feature.health} /></dd></div>
      <div><dt>{t("web.onboarding.summary.workflow")}</dt><dd>{pipelineName(props.feature.pipelineId)}</dd></div>
      <div><dt>{t("web.onboarding.summary.next")}</dt><dd>{props.feature.nextStepId === undefined ? "—" : props.contractLabel(props.feature.nextStepId)}</dd></div>
      <div><dt>{t("web.onboarding.summary.documents")}</dt><dd>{props.feature.documentCount}</dd></div>
    </dl>}
    <FormError message={props.error} />
    <Button variant="primary" disabled={props.busy || props.feature === undefined} onClick={props.onFinish}>{t("web.action.continueFraming")}</Button>
  </StepFrame>;
}

function StepFrame(props: { readonly icon: ReactNode; readonly question: string; readonly detail: string; readonly heading: RefObject<HTMLHeadingElement | null>; readonly children: ReactNode }) {
  return <section className="onboarding-step"><span className="onboarding-step-icon">{props.icon}</span><div className="onboarding-step-heading"><h2 ref={props.heading} tabIndex={-1}>{props.question}</h2><p>{props.detail}</p></div>{props.children}</section>;
}

function withDraft(progress: WebOnboardingProgress, draft: WebOnboardingDraft): WebOnboardingProgress {
  return { ...progress, draft };
}
