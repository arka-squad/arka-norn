import { GitBranch, ListChecks, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import type { OrchestrationAuthorizationInput, OrchestrationPreviewView, OrchestrationRunView } from "../../../src/application/web/contracts";
import { BridgeError } from "../bridge/http-bridge";
import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function OrchestrationPreviewPanel({ projectId, featureId }: { readonly projectId: string; readonly featureId: string }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [preview, setPreview] = useState<OrchestrationPreviewView>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [run, setRun] = useState<OrchestrationRunView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setBusy(true); setError("");
    try { setPreview(await bridge.previewOrchestration(projectId, featureId)); setRun(undefined); }
    catch (reason) { setError(reason instanceof BridgeError && reason.displayMessage.length > 0 ? reason.displayMessage : t("web.error.generic")); }
    finally { setBusy(false); }
  };

  return <section className="orchestration-preview" aria-labelledby="orchestration-preview-title">
    <div className="section-heading">
      <div><h2 id="orchestration-preview-title">{t("web.preview.title")}</h2><p className="section-subtitle">{t("web.preview.summary")}</p></div>
      <div className="preview-actions">
        <Button disabled={busy} onClick={() => void load()}><GitBranch size={15} />{t(preview === undefined ? "web.preview.open" : "web.preview.refresh")}</Button>
        {preview?.eligible === true ? <Button variant="primary" disabled={busy} onClick={() => setSheetOpen(true)}><ShieldCheck size={15} />{t("web.authorize.open")}</Button> : null}
      </div>
    </div>
    {error.length === 0 ? null : <p className="form-error" role="alert">{error}</p>}
    {run === undefined ? null : <p className="preview-run-started" role="status">{t("web.authorize.started", { campaign: run.campaignId, status: run.status.replaceAll("_", " ") })}</p>}
    {preview === undefined ? null : <PreviewBody preview={preview} />}
    {sheetOpen && preview !== undefined ? <AuthorizationSheet preview={preview} projectId={projectId} onClose={() => setSheetOpen(false)} onAuthorized={(result) => { setRun(result); setSheetOpen(false); }} /> : null}
  </section>;
}

function PreviewBody({ preview }: { readonly preview: OrchestrationPreviewView }) {
  const { t } = useI18n();
  return <div className="preview-body">
    <div className={preview.eligible ? "preview-verdict is-eligible" : "preview-verdict is-blocked"} role="status">
      {preview.eligible ? <ShieldCheck size={17} /> : <TriangleAlert size={17} />}
      <div>
        <strong>{t(preview.eligible ? "web.preview.eligible" : "web.preview.blocked")}</strong>
        <p>{preview.planFingerprint === null ? t("web.preview.planFingerprintNone") : <>{t("web.preview.planFingerprint")}: <code>{preview.planFingerprint.slice(0, 12)}</code></>}</p>
      </div>
    </div>

    <div className="preview-block">
      <h3><GitBranch size={14} />{t("web.preview.tasks")}</h3>
      {preview.tasks.length === 0 ? <p className="preview-empty">{t("web.preview.tasksEmpty")}</p> : <ul className="preview-task-list">{preview.tasks.map((task) => <li key={task.id}>
        <div className="preview-task-head"><strong>{task.id.replaceAll("-", " ")}</strong><span className="preview-role">{task.role.replaceAll("_", " ")}</span></div>
        {task.dependencies.length === 0 ? null : <p className="preview-line"><span>{t("web.preview.dependencies")}</span> {task.dependencies.join(", ")}</p>}
        <p className="preview-line"><span>{t("web.preview.writeScopes")}</span> {task.writeScopes.map((scope) => <code key={scope}>{scope}</code>)}</p>
        {task.readScopes.length === 0 ? null : <p className="preview-line"><span>{t("web.preview.readScopes")}</span> {task.readScopes.map((scope) => <code key={scope}>{scope}</code>)}</p>}
        {task.deliverables.length === 0 ? null : <p className="preview-line"><span>{t("web.preview.deliverables")}</span> {task.deliverables.join(" · ")}</p>}
        {task.validations.length === 0 ? null : <p className="preview-line"><span>{t("web.preview.validations")}</span> {task.validations.join(" · ")}</p>}
      </li>)}</ul>}
    </div>

    <div className="preview-columns">
      <div className="preview-block">
        <h3><ListChecks size={14} />{t("web.preview.profiles")}</h3>
        {preview.profiles.length === 0 ? <p className="preview-empty">{t("web.preview.profilesEmpty")}</p> : <ul className="preview-profile-list">{preview.profiles.map((profile) => <li key={profile.id}>
          <strong>{profile.id}</strong>
          <small>{profile.transport} · {profile.provider} / {profile.model}</small>
          <span className="preview-cost">{t("web.preview.cost")}: {profile.costMetric} ({t(profile.costObservable ? "web.preview.costMeasured" : "web.preview.costUnknown")})</span>
        </li>)}</ul>}
        <p className="preview-note">{t("web.preview.noProfileForRole")}</p>
      </div>

      <div className="preview-block">
        <h3><ShieldCheck size={14} />{t("web.preview.preflights")}</h3>
        {preview.preflights.length === 0 ? <p className="preview-empty">{t("web.preview.profilesEmpty")}</p> : <ul className="preview-preflight-list">{preview.preflights.map((preflight) => <li key={preflight.profileId}>
          <span className={preflight.healthy ? "preview-flag is-ok" : "preview-flag is-bad"}>{t(preflight.healthy ? "web.preview.preflightHealthy" : "web.preview.preflightBlocked")}</span>
          <div><strong>{preflight.profileId}</strong><small>{preflight.code.replaceAll("_", " ")} · {preflight.message}</small></div>
        </li>)}</ul>}
      </div>
    </div>

    <div className="preview-block">
      <h3><TriangleAlert size={14} />{t("web.preview.issues")}</h3>
      {preview.issues.length === 0 ? <p className="preview-empty">{t("web.preview.issuesEmpty")}</p> : <ul className="preview-issue-list">{preview.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issue.code.replaceAll("_", " ")}</strong><small>{issue.message}</small></li>)}</ul>}
    </div>
  </div>;
}

function AuthorizationSheet({ preview, projectId, onClose, onAuthorized }: { readonly preview: OrchestrationPreviewView; readonly projectId: string; readonly onClose: () => void; readonly onAuthorized: (run: OrchestrationRunView) => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const roles = useMemo(() => [...new Set([...preview.tasks.map((task) => task.role), "integrator"])], [preview.tasks]);
  const [actor, setActor] = useState("");
  const [profileByRole, setProfileByRole] = useState<Record<string, string>>({});
  const [allowCommits, setAllowCommits] = useState(true);
  const [applyMode, setApplyMode] = useState<"human" | "automatic">("human");
  const [riskThreshold, setRiskThreshold] = useState(20);
  const [maxParallel, setMaxParallel] = useState<string>("3");
  const [budgetMode, setBudgetMode] = useState<"admission" | "hard-stop" | "observe">("admission");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rolesAssigned = roles.every((role) => (profileByRole[role] ?? "").length > 0);
  const canSubmit = preview.eligible && preview.planFingerprint !== null && actor.trim().length > 0 && rolesAssigned && confirmed;

  const submit = async () => {
    if (preview.planFingerprint === null) return;
    setBusy(true); setError("");
    try {
      const input: OrchestrationAuthorizationInput = {
        previewFingerprint: preview.planFingerprint,
        riskPolicyFingerprint: preview.riskPolicyFingerprint,
        actor: actor.trim(),
        profileByRole,
        allowCommits,
        applyMode,
        automaticRiskThreshold: riskThreshold,
        maxParallel: maxParallel === "all" ? "all" : Number(maxParallel),
        budgetMode,
        budgetLimits: [],
        openBarProfiles: [],
      };
      onAuthorized(await bridge.authorizeOrchestration(projectId, input));
    } catch (reason) {
      setError(reason instanceof BridgeError && reason.displayMessage.length > 0 ? reason.displayMessage : t("web.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const footer = <><Button onClick={onClose}>{t("web.authorize.cancel")}</Button><Button variant="primary" disabled={busy || !canSubmit} onClick={() => void submit()}><ShieldCheck size={15} />{t("web.authorize.submit")}</Button></>;
  return <Modal title={t("web.authorize.title")} description={t("web.authorize.summary")} icon={<ShieldCheck size={16} />} size="wide" onClose={onClose} footer={footer}>
    <div className="authorize-sheet">
      <label className="authorize-field"><span>{t("web.authorize.actor")}</span><input value={actor} placeholder={t("web.authorize.actorPlaceholder")} onChange={(event) => setActor(event.target.value)} /></label>

      <fieldset className="authorize-roles"><legend>{t("web.authorize.roles")}</legend>
        {roles.map((role) => <label key={role} className="authorize-role"><span>{role.replaceAll("_", " ")}</span>
          <select value={profileByRole[role] ?? ""} onChange={(event) => setProfileByRole((current) => ({ ...current, [role]: event.target.value }))}>
            <option value="">{t("web.authorize.rolePlaceholder")}</option>
            {preview.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.id}</option>)}
          </select>
        </label>)}
        {rolesAssigned ? null : <p className="authorize-hint">{t("web.authorize.rolesMissing")}</p>}
      </fieldset>

      <div className="authorize-grid">
        <label className="authorize-toggle"><input type="checkbox" checked={allowCommits} onChange={(event) => setAllowCommits(event.target.checked)} />{t("web.authorize.commit")}</label>
        <label className="authorize-field"><span>{t("web.authorize.applyMode")}</span>
          <select value={applyMode} onChange={(event) => setApplyMode(event.target.value === "automatic" ? "automatic" : "human")}>
            <option value="human">{t("web.authorize.applyHuman")}</option>
            <option value="automatic">{t("web.authorize.applyAutomatic")}</option>
          </select>
        </label>
        <label className="authorize-field"><span>{t("web.authorize.riskThreshold")}</span><input type="number" min={0} max={20} value={riskThreshold} onChange={(event) => setRiskThreshold(Math.max(0, Math.min(20, Number(event.target.value))))} /></label>
        <label className="authorize-field"><span>{t("web.authorize.parallel")}</span>
          <select value={maxParallel} onChange={(event) => setMaxParallel(event.target.value)}>
            {["1", "2", "3", "4", "5", "6"].map((value) => <option key={value} value={value}>{value}</option>)}
            <option value="all">{t("web.authorize.parallelAll")}</option>
          </select>
        </label>
        <label className="authorize-field"><span>{t("web.authorize.budgetMode")}</span>
          <select value={budgetMode} onChange={(event) => setBudgetMode(event.target.value as "admission" | "hard-stop" | "observe")}>
            <option value="admission">{t("web.authorize.budgetAdmission")}</option>
            <option value="hard-stop">{t("web.authorize.budgetHardStop")}</option>
            <option value="observe">{t("web.authorize.budgetObserve")}</option>
          </select>
        </label>
      </div>

      <div className="authorize-fingerprint"><span>{t("web.authorize.fingerprint")}</span><code>{preview.planFingerprint ?? "—"}</code></div>
      <label className="authorize-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{t("web.authorize.confirm")}</label>
      {error.length === 0 ? null : <p className="form-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}

