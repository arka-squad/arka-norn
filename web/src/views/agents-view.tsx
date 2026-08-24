import { Bot, FileSignature } from "lucide-react";

import type { AgentTrackingView } from "../../../src/application/web/contracts";
import { EmptyState, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function AgentsView({ agents }: { readonly agents: readonly AgentTrackingView[] }) {
  const { t } = useI18n();
  return <div className="page"><PageTitle title={t("web.agents.title")} summary={t("web.agents.summary")} />{agents.length === 0 ? <EmptyState>{t("web.agents.empty")}</EmptyState> : <div className="agent-list">{agents.map((agent) => <article key={agent.id}><header><span className="agent-icon"><Bot size={20} /></span><div><h2>{agent.role}</h2><p>{agent.provider} · {agent.id}</p></div><span className={agent.active ? "registration active" : "registration"}>{t(agent.active ? "web.agents.active" : "web.agents.inactive")}</span></header><dl><div><dt>{t("web.agents.scope")}</dt><dd>{[...agent.featureIds, ...agent.paths, ...agent.responsibilities].join(" · ") || t("web.agents.projectWide")}</dd></div><div><dt>{t("web.agents.productions")}</dt><dd><FileSignature size={15} />{agent.productionIds.length}</dd></div></dl></article>)}</div>}</div>;
}
