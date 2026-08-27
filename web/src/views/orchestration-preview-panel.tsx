import { GitBranch, ListChecks, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { OrchestrationPreviewView } from "../../../src/application/web/contracts";
import { BridgeError } from "../bridge/http-bridge";
import { useBridge } from "../bridge/context";
import { useI18n } from "../i18n/i18n";
import { Button } from "../components/ui";

export function OrchestrationPreviewPanel({ projectId, featureId }: { readonly projectId: string; readonly featureId: string }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [preview, setPreview] = useState<OrchestrationPreviewView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setBusy(true); setError("");
    try { setPreview(await bridge.previewOrchestration(projectId, featureId)); }
    catch (reason) { setError(reason instanceof BridgeError && reason.displayMessage.length > 0 ? reason.displayMessage : t("web.error.generic")); }
    finally { setBusy(false); }
  };

  return <section className="orchestration-preview" aria-labelledby="orchestration-preview-title">
    <div className="section-heading">
      <div><h2 id="orchestration-preview-title">{t("web.preview.title")}</h2><p className="section-subtitle">{t("web.preview.summary")}</p></div>
      <Button disabled={busy} onClick={() => void load()}><GitBranch size={15} />{t(preview === undefined ? "web.preview.open" : "web.preview.refresh")}</Button>
    </div>
    {error.length === 0 ? null : <p className="form-error" role="alert">{error}</p>}
    {preview === undefined ? null : <PreviewBody preview={preview} />}
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

