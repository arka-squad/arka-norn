import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import type { DoctorInspectionReport, DoctorRepairOutcome, DoctorRepairPlan } from "../../../src/ports/inbound/for-doctor";
import { BridgeError } from "../bridge/http-bridge";
import { useBridge } from "../bridge/context";
import { useI18n } from "../i18n/i18n";
import { Button } from "./ui";
import { DoctorReportView } from "./doctor-report";

export function DoctorPanel() {
  const bridge = useBridge();
  const { date, t } = useI18n();
  const [inspection, setInspection] = useState<DoctorInspectionReport>();
  const [plan, setPlan] = useState<DoctorRepairPlan>();
  const [outcome, setOutcome] = useState<DoctorRepairOutcome>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const inspect = () => run(async () => {
    setInspection(await bridge.inspectDoctor());
    setPlan(undefined); setOutcome(undefined); setConfirmed(false);
  });
  const preview = () => run(async () => {
    setPlan(await bridge.previewDoctorRepairs());
    setOutcome(undefined); setConfirmed(false);
  });
  const apply = () => plan === undefined ? undefined : run(async () => {
    try {
      const result = await bridge.applyDoctorRepairs({ fingerprint: plan.fingerprint, confirmed });
      setOutcome(result); setInspection(result.report); setPlan(undefined); setConfirmed(false);
    } catch (reason) {
      if (reason instanceof BridgeError && reason.code === "repair_plan_changed") {
        setPlan(await bridge.previewDoctorRepairs());
        setConfirmed(false);
      }
      throw reason;
    }
  });
  async function run(operation: () => Promise<void>): Promise<void> {
    setBusy(true); setError("");
    try { await operation(); }
    catch (reason) { setError(reason instanceof BridgeError && reason.displayMessage.length > 0 ? reason.displayMessage : t("web.error.generic")); }
    finally { setBusy(false); }
  }

  const repairable = inspection?.checks.some((check) => check.repairable) === true;
  return <section className="settings-section doctor-settings"><div className="settings-heading"><ShieldAlert size={20} /><div><h2>{t("web.settings.doctor")}</h2><p>{t("web.settings.doctorSummary")}</p></div></div>
    <div className="doctor-workflow">
      <div className="doctor-actions"><Button disabled={busy} onClick={() => void inspect()}>{t("web.action.inspectDoctor")}</Button>{inspection === undefined || !repairable ? null : <Button disabled={busy} onClick={() => void preview()}>{t("web.action.previewRepairs")}</Button>}</div>
      {outcome === undefined ? null : <p className="doctor-applied" role="status">{t("web.settings.repairApplied")}</p>}
      {plan === undefined ? null : <div className="doctor-plan-meta"><strong>{t("web.settings.repairPlan")}</strong><span>{t("web.settings.repairPlanId")}: <code title={plan.fingerprint}>{plan.fingerprint.slice(0, 12)}</code></span><span>{t("web.settings.repairPlanExpires", { date: date(plan.expiresAt) })}</span></div>}
      {plan === undefined ? null : <><DoctorReportView report={plan.report} /><label className="confirm-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{t("web.settings.repairReviewed")}</label><Button variant="danger" disabled={busy || !confirmed || plan.report.repairs.length === 0} onClick={() => void apply()}>{t("web.action.applyRepair")}</Button></>}
      {plan !== undefined ? null : inspection === undefined ? null : <DoctorReportView report={inspection} />}
      {error.length === 0 ? null : <p className="form-error" role="alert">{error}</p>}
    </div>
  </section>;
}
