import { ArrowRightLeft, Bot, FileSignature, Link2, Plus, Power, UserCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { AgentMutationInput, AgentRegistryView, AgentTrackingView, ProjectOverview } from "../../../src/application/web/contracts";
import { BridgeError } from "../bridge/http-bridge";
import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button, EmptyState, PageTitle } from "../components/ui";
import { useI18n, type MessageKey } from "../i18n/i18n";

type AgentDialog = { readonly kind: "register" } | { readonly kind: "replace" | "select" | "deactivate"; readonly agent: AgentTrackingView };

export function AgentsView({ project, registry, onChanged }: { readonly project: ProjectOverview; readonly registry: AgentRegistryView; readonly onChanged: () => void }) {
  const { t, date } = useI18n();
  const [dialog, setDialog] = useState<AgentDialog>();
  return <div className="page"><PageTitle title={t("web.agents.title")} summary={t("web.agents.summary")} actions={<Button variant="primary" onClick={() => setDialog({ kind: "register" })}><Plus size={15} />{t("web.agents.register")}</Button>} />
    {registry.agents.length === 0 ? <EmptyState title={t("web.agents.empty")} description={t("web.agents.emptyDetail")} icon={<Bot size={16} />} /> : <div className="agent-list">{registry.agents.map((agent) => <article key={agent.id} className={agent.active ? "" : "is-inactive"}><header><span className="agent-icon"><Bot size={20} /></span><div><h2>{agent.role}</h2><p>{agent.provider} · {agent.id}</p></div><span className={agent.active ? "registration active" : "registration"}>{t(agent.active ? "web.agents.active" : "web.agents.inactive")}</span></header>
      <dl><div><dt>{t("web.agents.sessions")}</dt><dd><Link2 size={14} />{agent.currentSessionIds.join(" · ") || t("web.agents.noSession")}</dd></div><div><dt>{t("web.agents.scope")}</dt><dd>{[...agent.featureIds, ...agent.paths, ...agent.responsibilities].join(" · ") || t("web.agents.projectWide")}</dd></div><div><dt>{t("web.agents.lineage")}</dt><dd>{agent.replacesAgentId === undefined && agent.replacedByAgentId === undefined ? t("web.agents.original") : [agent.replacesAgentId === undefined ? "" : `← ${agent.replacesAgentId}`, agent.replacedByAgentId === undefined ? "" : `→ ${agent.replacedByAgentId}`].filter(Boolean).join(" · ")}</dd></div><div><dt>{t("web.agents.registered")}</dt><dd>{date(agent.registeredAt)}</dd></div><div><dt>{t("web.agents.productions")}</dt><dd><FileSignature size={15} />{agent.productionIds.length}</dd></div></dl>
      {agent.active ? <footer><Button variant="ghost" onClick={() => setDialog({ kind: "select", agent })}><UserCheck size={14} />{t("web.agents.select")}</Button><Button variant="ghost" onClick={() => setDialog({ kind: "replace", agent })}><ArrowRightLeft size={14} />{t("web.agents.replace")}</Button><Button variant="danger" onClick={() => setDialog({ kind: "deactivate", agent })}><Power size={14} />{t("web.agents.deactivate")}</Button></footer> : null}
    </article>)}</div>}
    {dialog === undefined ? null : <AgentDialogView project={project} registry={registry} dialog={dialog} onClose={() => setDialog(undefined)} onChanged={() => { setDialog(undefined); onChanged(); }} />}
  </div>;
}

function AgentDialogView({ project, registry, dialog, onClose, onChanged }: { readonly project: ProjectOverview; readonly registry: AgentRegistryView; readonly dialog: AgentDialog; readonly onClose: () => void; readonly onChanged: () => void }) {
  const { t } = useI18n();
  const bridge = useBridge();
  const agent = dialog.kind === "register" ? undefined : dialog.agent;
  const [provider, setProvider] = useState(agent?.provider ?? "");
  const [role, setRole] = useState(agent?.role ?? "product");
  const [sessionId, setSessionId] = useState(agent?.currentSessionIds[0] ?? "main");
  const [featureIds, setFeatureIds] = useState(agent?.featureIds.join(", ") ?? "");
  const [paths, setPaths] = useState(agent?.paths.join(", ") ?? "");
  const [responsibilities, setResponsibilities] = useState(agent?.responsibilities.join(", ") ?? "");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (dialog.kind === "select") await bridge.selectAgent(project.id, dialog.agent.id, { sessionId, expectedRegistryRevision: registry.registryRevision });
      else if (dialog.kind === "deactivate") await bridge.deactivateAgent(project.id, dialog.agent.id, { expectedRegistryRevision: registry.registryRevision, confirmation });
      else {
        const input: AgentMutationInput = { provider, role, sessionId, expectedRegistryRevision: registry.registryRevision, scope: { featureIds: csv(featureIds), paths: csv(paths), responsibilities: csv(responsibilities) } };
        if (dialog.kind === "register") await bridge.registerAgent(project.id, input);
        else await bridge.replaceAgent(project.id, dialog.agent.id, input);
      }
      onChanged();
    } catch (reason) { setError(reason instanceof BridgeError && reason.displayMessage.length > 0 ? reason.displayMessage : t("web.error.generic")); }
    finally { setBusy(false); }
  };
  const valid = agentDialogValid(dialog, { confirmation, provider, role, sessionId });
  return <Modal title={t(agentDialogTitle(dialog.kind))} description={t(agentDialogDetail(dialog.kind))} icon={<Bot size={16} />} onClose={onClose} footer={<><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button form="agent-mutation" type="submit" variant={dialog.kind === "deactivate" ? "danger" : "primary"} disabled={busy || !valid}>{t("web.action.confirm")}</Button></>}>
    <form id="agent-mutation" className="form-grid" onSubmit={(event) => void submit(event)}>
      {dialog.kind === "select" || dialog.kind === "deactivate" ? null : <><label>{t("web.agents.provider")}<input required maxLength={80} value={provider} onChange={(event) => setProvider(event.target.value)} /></label><label>{t("web.agents.role")}<input required maxLength={80} value={role} onChange={(event) => setRole(event.target.value)} /></label></>}
      {dialog.kind === "deactivate" ? null : <label className="full">{t("web.agents.session")}<input required maxLength={64} value={sessionId} onChange={(event) => setSessionId(event.target.value)} /><small>{t("web.agents.sessionHint")}</small></label>}
      {dialog.kind === "register" || dialog.kind === "replace" ? <><label className="full">{t("web.agents.features")}<input value={featureIds} onChange={(event) => setFeatureIds(event.target.value)} placeholder={project.features.map((feature) => feature.id).join(", ")} /></label><label className="full">{t("web.agents.paths")}<input value={paths} onChange={(event) => setPaths(event.target.value)} /></label><label className="full">{t("web.agents.responsibilities")}<input value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} /></label></> : null}
      {dialog.kind === "deactivate" && agent !== undefined && agent.currentSessionIds.length > 0 ? <label className="full">{t("web.agents.confirmIdentity", { id: agent.id })}<input required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label> : null}
      {error.length === 0 ? null : <p className="form-error full" role="alert">{error}</p>}
    </form>
  </Modal>;
}

function agentDialogTitle(kind: AgentDialog["kind"]): MessageKey {
  if (kind === "register") return "web.agents.registerTitle";
  if (kind === "replace") return "web.agents.replaceTitle";
  if (kind === "select") return "web.agents.selectTitle";
  return "web.agents.deactivateTitle";
}

function agentDialogDetail(kind: AgentDialog["kind"]): MessageKey {
  if (kind === "replace") return "web.agents.replaceDetail";
  if (kind === "deactivate") return "web.agents.deactivateDetail";
  return "web.agents.mutationDetail";
}

function agentDialogValid(dialog: AgentDialog, values: { readonly confirmation: string; readonly provider: string; readonly role: string; readonly sessionId: string }): boolean {
  if (dialog.kind === "deactivate") return dialog.agent.currentSessionIds.length === 0 || values.confirmation === dialog.agent.id;
  if (dialog.kind === "select") return values.sessionId.length > 0;
  return values.provider.trim().length > 0 && values.role.trim().length > 0 && values.sessionId.length > 0;
}

function csv(value: string): readonly string[] { return value.split(",").map((entry) => entry.trim()).filter(Boolean); }
