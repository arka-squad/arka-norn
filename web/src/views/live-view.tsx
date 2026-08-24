import { Activity, Clock3, Radio, ShieldCheck } from "lucide-react";

import type { OrchestrationTrackingView } from "../../../src/application/web/contracts";
import { EmptyState, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function LiveView({ orchestrations }: { readonly orchestrations: readonly OrchestrationTrackingView[] }) {
  const { t, date, duration } = useI18n();
  return <div className="page"><PageTitle title={t("web.live.title")} summary={t("web.live.summary")} />{orchestrations.length === 0 ? <EmptyState title={t("web.live.empty")} description={t("web.live.emptyDetail")} icon={<Radio size={16} />} /> : <div className="execution-list">{orchestrations.map((execution) => <article key={execution.id}><header><span className={execution.heartbeatAlive ? "execution-pulse alive" : "execution-pulse"}><Activity size={18} /></span><div><h2>{execution.stepId.replaceAll("_", " ")}</h2><p>{execution.featureId ?? t("web.common.project")} · {execution.provider}{execution.model === undefined ? "" : ` / ${execution.model}`}</p></div><span className={`execution-status execution-${execution.status}`}>{execution.status}</span></header><dl><div><dt><Clock3 size={14} />{t("web.live.duration")}</dt><dd>{execution.durationMs === undefined ? "—" : duration(execution.durationMs)}</dd></div><div><dt><Radio size={14} />{t("web.live.heartbeat")}</dt><dd>{execution.heartbeatAt === undefined ? "—" : date(execution.heartbeatAt)}</dd></div><div><dt><Activity size={14} />{t("web.live.lastEvent")}</dt><dd>{execution.lastEvent?.type ?? "—"}</dd></div><div><dt><ShieldCheck size={14} />{t("web.live.proofs")}</dt><dd>{execution.proofReferences.length}</dd></div></dl>{execution.suspension === undefined ? null : <div className="notice notice-warn">{execution.suspension.code} · {execution.suspension.detail}</div>}</article>)}</div>}</div>;
}
