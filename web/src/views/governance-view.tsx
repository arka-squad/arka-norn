import { useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardCheck, Plus } from "lucide-react";

import type { GovernanceEventKind, GovernanceTargetType } from "../../../src/domain/governance/governance-event";
import type { GovernanceEventView, GovernanceView } from "../../../src/application/web/contracts";
import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button, EmptyState, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function GovernancePage({ projectId, governance, onChanged }: { readonly projectId: string; readonly governance: GovernanceView; readonly onChanged: () => void }) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<{ readonly kind: "create" } | { readonly kind: "resolve"; readonly event: GovernanceEventView }>();
  return <div className="page"><PageTitle title={t("web.governance.title")} summary={t("web.governance.summary")} actions={<Button variant="primary" onClick={() => setDialog({ kind: "create" })}><Plus size={16} />{t("web.action.recordDecision")}</Button>} />
    <div className="notice"><ClipboardCheck size={18} /><span>{t("web.governance.immutable")}</span></div>
    <section className="governance-section"><div className="section-heading"><h2>{t("web.governance.open")}</h2><span>{governance.openDecisions.length + governance.openCorrections.length}</span></div>{governance.openDecisions.length + governance.openCorrections.length === 0 ? <EmptyState>{t("web.governance.empty")}</EmptyState> : <div className="governance-list">{[...governance.openDecisions, ...governance.openCorrections].map((event) => <GovernanceRow key={event.id} event={event} action={<Button variant="ghost" onClick={() => setDialog({ kind: "resolve", event })}><CheckCircle2 size={15} />{t("web.action.resolve")}</Button>} />)}</div>}</section>
    <section className="governance-section"><div className="section-heading"><h2>{t("web.governance.history")}</h2><span>{governance.revision}</span></div><div className="governance-list muted">{governance.history.map((event) => <GovernanceRow key={event.id} event={event} />)}</div></section>
    {dialog === undefined ? null : <GovernanceDialog projectId={projectId} {...(dialog.kind === "resolve" ? { resolving: dialog.event } : {})} onClose={() => setDialog(undefined)} onSaved={() => { setDialog(undefined); onChanged(); }} />}
  </div>;
}

function GovernanceRow({ event, action }: { readonly event: GovernanceEventView; readonly action?: React.ReactNode }) {
  const { date } = useI18n();
  return <article><span className="event-kind">{event.kind.replaceAll("_", " ")}</span><div><strong>{event.reason}</strong><p>{event.targets.map((target) => `${target.type}:${target.id}`).join(" · ")}</p><small>{event.author.name} · {date(event.occurredAt)}</small></div>{action}</article>;
}

function GovernanceDialog({ projectId, resolving, onClose, onSaved }: { readonly projectId: string; readonly resolving?: GovernanceEventView; readonly onClose: () => void; readonly onSaved: () => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [kind, setKind] = useState<GovernanceEventKind>(resolving?.kind === "correction_requested" ? "decision_resolved" : "decision_opened");
  const [targetType, setTargetType] = useState<GovernanceTargetType>(resolving?.targets[0]?.type ?? "project");
  const [targetId, setTargetId] = useState(resolving?.targets[0]?.id ?? projectId);
  const [reason, setReason] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await bridge.appendGovernance(projectId, {
      kind,
      targets: [{ type: targetType, id: targetId }],
      reason,
      ...(resolving === undefined ? {} : { resolvesEventId: resolving.id }),
    });
    onSaved();
  };
  return <Modal title={resolving === undefined ? t("web.action.recordDecision") : t("web.action.resolve")} onClose={onClose} footer={<><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button form="governance-event" type="submit" variant="primary">{t("web.action.confirm")}</Button></>}>
    <form id="governance-event" className="form-grid" onSubmit={(event) => void submit(event)}>
      <label>{t("web.form.kind")}<select value={kind} onChange={(event) => setKind(event.target.value as GovernanceEventKind)}>{["decision_opened", "correction_requested", "risk_acknowledged", "debt_acknowledged", "decision_resolved", "decision_superseded"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>{t("web.form.targetType")}<select value={targetType} onChange={(event) => setTargetType(event.target.value as GovernanceTargetType)}>{["project", "feature", "step", "document", "finding", "debt"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="full">{t("web.form.targetId")}<input required pattern="[a-z0-9][a-z0-9._-]{0,127}" value={targetId} onChange={(event) => setTargetId(event.target.value)} /></label>
      <label className="full">{t("web.governance.reason")}<textarea required maxLength={2000} rows={5} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </form>
  </Modal>;
}
