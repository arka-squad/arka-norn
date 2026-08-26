import { ArrowRight, Compass, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { FramingSummaryView } from "../../../src/application/web/contracts";
import { Button } from "./ui";
import { useI18n } from "../i18n/i18n";

export function FramingCard(props: {
  readonly framing?: FramingSummaryView;
  readonly onOpen?: () => void;
  readonly onStart?: () => Promise<void>;
  readonly startLabel?: string;
}) {
  const { t, date } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const start = async () => {
    if (props.onStart === undefined) return;
    setBusy(true);
    setError(false);
    try { await props.onStart(); } catch { setError(true); } finally { setBusy(false); }
  };
  if (props.framing === undefined) return <section className="framing-card framing-card-empty">
    <span className="framing-card-icon"><Compass size={21} /></span>
    <div className="framing-card-copy"><small>{t("web.framing.eyebrow")}</small><h2>{t("web.framing.projectEmptyTitle")}</h2><p>{t("web.framing.projectEmptyDetail")}</p>{error ? <em role="alert">{t("web.error.actionRejected")}</em> : null}</div>
    {props.onStart === undefined ? null : <Button variant="primary" disabled={busy} onClick={() => void start()}>{busy ? <RefreshCw className="spin" size={15} /> : <Compass size={15} />}{props.startLabel ?? t("web.framing.start")}</Button>}
  </section>;
  const framing = props.framing;
  return <section className={`framing-card framing-attention-${framing.attention}`}>
    <span className="framing-card-icon"><Compass size={21} /></span>
    <div className="framing-card-copy">
      <small>{framing.published ? t("web.framing.published") : t("web.framing.inProgress")}</small>
      <h2>{framing.targetTitle}</h2>
      <p>{framing.summary}</p>
      <strong>{framing.nextMove}</strong>
      <div className="framing-card-facts"><span>{repositoryLabel(framing.repositoryNature, t)}</span><span>{t("web.framing.revision").replace("{revision}", String(framing.revision))}</span><span>{date(framing.updatedAt)}</span></div>
    </div>
    {props.onOpen === undefined ? null : <Button variant="primary" onClick={props.onOpen}>{framing.published ? t("web.framing.openPlan") : t("web.framing.resume")}<ArrowRight size={15} /></Button>}
  </section>;
}

function repositoryLabel(nature: FramingSummaryView["repositoryNature"], t: ReturnType<typeof useI18n>["t"]): string {
  if (nature === "empty") return t("web.framing.repository.empty");
  if (nature === "skeleton") return t("web.framing.repository.skeleton");
  if (nature === "implemented") return t("web.framing.repository.implemented");
  return t("web.framing.repository.indeterminate");
}
