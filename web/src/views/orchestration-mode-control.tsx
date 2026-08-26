import { Activity, Bot, Hand, Settings2 } from "lucide-react";
import { useState } from "react";

import type { ProjectOverview } from "../../../src/application/web/contracts";
import { BridgeError } from "../bridge/http-bridge";
import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function OrchestrationModeControl({ project, onChanged }: { readonly project: ProjectOverview; readonly onChanged: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const assisted = project.orchestrationMode === "automatic";
  return <section className="orchestration-mode-card" aria-labelledby="orchestration-mode-title">
    <span className={assisted ? "mode-icon is-assisted" : "mode-icon"}>{assisted ? <Bot size={19} /> : <Hand size={19} />}</span>
    <div className="mode-summary">
      <h2 id="orchestration-mode-title">{t("web.project.mode.title")}</h2>
      <strong>{t(assisted ? "web.project.mode.assisted" : "web.project.mode.manual")}</strong>
      <p>{t(assisted ? "web.project.mode.assistedSummary" : "web.project.mode.manualSummary")}</p>
      <span className={project.orchestration.preflight.readyForPreview ? "mode-readiness is-ready" : "mode-readiness"}>
        <Activity size={13} />{t("web.project.mode.profiles", { enabled: project.orchestration.preflight.enabledProfiles, total: project.orchestration.preflight.configuredProfiles })}
      </span>
    </div>
    <Button onClick={() => setOpen(true)}><Settings2 size={15} />{t("web.action.changeMode")}</Button>
    {open ? <OrchestrationModeDialog project={project} onClose={() => setOpen(false)} onChanged={() => { setOpen(false); onChanged(); }} /> : null}
  </section>;
}

function OrchestrationModeDialog({ project, onClose, onChanged }: { readonly project: ProjectOverview; readonly onClose: () => void; readonly onChanged: () => void }) {
  const { t } = useI18n();
  const bridge = useBridge();
  const [mode, setMode] = useState<"manual" | "automatic">(project.orchestrationMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const automaticUnavailable = mode === "automatic" && !project.orchestration.preflight.readyForPreview;
  const unchanged = mode === project.orchestrationMode;
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await bridge.setProjectOrchestrationMode(project.id, { mode, expectedUpdatedAt: project.updatedAt });
      onChanged();
    } catch (reason) {
      setError(reason instanceof BridgeError && reason.displayMessage.length > 0 ? reason.displayMessage : t("web.error.generic"));
    } finally {
      setBusy(false);
    }
  };
  return <Modal title={t("web.project.mode.dialogTitle")} description={t("web.project.mode.dialogDetail")} icon={<Settings2 size={16} />} onClose={onClose} footer={<><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button variant="primary" disabled={busy || unchanged || automaticUnavailable} onClick={() => void submit()}>{t("web.action.save")}</Button></>}>
    <div className="mode-dialog-content">
      <p className="mode-current"><span>{t("web.project.mode.current")}</span><strong>{t(project.orchestrationMode === "automatic" ? "web.project.mode.assisted" : "web.project.mode.manual")}</strong></p>
      <fieldset className="mode-options"><legend>{t("web.project.mode.choose")}</legend>
        <label className={mode === "manual" ? "is-selected" : ""}><input type="radio" name="orchestration-mode" value="manual" checked={mode === "manual"} onChange={() => setMode("manual")} /><Hand size={18} /><span><strong>{t("web.project.mode.manual")}</strong><small>{t("web.project.mode.manualEffect")}</small></span></label>
        <label className={mode === "automatic" ? "is-selected" : ""}><input type="radio" name="orchestration-mode" value="automatic" checked={mode === "automatic"} onChange={() => setMode("automatic")} /><Bot size={18} /><span><strong>{t("web.project.mode.assisted")}</strong><small>{t("web.project.mode.automaticEffect")}</small></span></label>
      </fieldset>
      <div className={project.orchestration.preflight.readyForPreview ? "mode-preflight is-ready" : "mode-preflight"} role="status">
        <Activity size={17} /><div><strong>{t("web.project.mode.profiles", { enabled: project.orchestration.preflight.enabledProfiles, total: project.orchestration.preflight.configuredProfiles })}</strong><p>{t(project.orchestration.preflight.readyForPreview ? "web.project.mode.preflightReady" : "web.project.mode.preflightMissing")}</p></div>
      </div>
      <div className="mode-active-runs"><strong>{t("web.project.mode.activeRuns", { count: project.orchestration.activeRuns.length })}</strong><p>{t(project.orchestration.activeRuns.length === 0 ? "web.project.mode.noActiveRun" : "web.project.mode.activeRunsContinue")}</p>{project.orchestration.activeRuns.length === 0 ? null : <ul>{project.orchestration.activeRuns.map((run) => <li key={run.id}><span>{run.id}</span><small>{run.status}</small></li>)}</ul>}</div>
      {error.length === 0 ? null : <p className="form-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}
