import { AlertCircle, Check, Circle, LockKeyhole } from "lucide-react";

import type { TrackingStep } from "../../../src/application/web/contracts";
import { useI18n } from "../i18n/i18n";

export function PipelineRail({ steps }: { readonly steps: readonly TrackingStep[] }) {
  const { t, contractLabel } = useI18n();
  return <div className="pipeline-scroll"><ol className="pipeline-rail" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(98px, 1fr))`, minWidth: `${steps.length * 98}px` }}>{steps.map((step) => {
    const complete = step.status === "completed";
    const problem = step.status === "failed" || step.status === "blocked";
    const current = step.status === "in_progress" || (!complete && !problem && step.documentIds.length > 0);
    return <li key={step.id} className={complete ? "complete" : problem ? "problem" : current ? "current" : "pending"}>
      <span className="rail-marker">{complete ? <Check size={14} /> : problem ? <AlertCircle size={15} /> : current ? <Circle size={11} fill="currentColor" /> : <LockKeyhole size={13} />}</span>
      <strong>{contractLabel(step.id)}</strong>
      <small>{step.documentIds.length > 0 ? `${step.documentIds.length} ${t(step.documentIds.length === 1 ? "web.pipeline.document" : "web.pipeline.documents")}` : step.required ? contractLabel(step.status) : t("web.pipeline.optional")}</small>
    </li>;
  })}</ol></div>;
}
