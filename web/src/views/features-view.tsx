import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import type { ProjectOverview } from "../../../src/application/web/contracts";
import { contracts } from "../generated/contracts";
import { useBridge } from "../bridge/context";
import { featureRoute } from "../app/router";
import { Modal } from "../components/modal";
import { Button, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";
import { FeatureTable } from "./project-overview";

export function FeaturesView({ project, navigate, onCreated }: { readonly project: ProjectOverview; readonly navigate: (path: string) => void; readonly onCreated: () => void }) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  return <div className="page"><PageTitle title={t("web.nav.features")} summary={`${project.features.length} tracked Features`} actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} />{t("web.action.createFeature")}</Button>} /><FeatureTable project={project} navigate={navigate} />{creating ? <CreateFeatureDialog project={project} onClose={() => setCreating(false)} onCreated={(id) => { onCreated(); navigate(featureRoute(project.id, id)); }} /> : null}</div>;
}

function CreateFeatureDialog({ project, onClose, onCreated }: { readonly project: ProjectOverview; readonly onClose: () => void; readonly onCreated: (id: string) => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [root, setRoot] = useState("");
  const [pipelineId, setPipelineId] = useState<string>(contracts.defaultPipelineId);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { onCreated((await bridge.createFeature(project.id, { id, name, root, pipelineId })).id); } finally { setBusy(false); }
  };
  return <Modal title={t("web.action.createFeature")} onClose={onClose} footer={<><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button form="create-feature" type="submit" variant="primary" disabled={busy}>{t("web.action.confirm")}</Button></>}>
    <form id="create-feature" className="form-grid" onSubmit={(event) => void submit(event)}>
      <label>{t("web.form.name")}<input required maxLength={256} value={name} onChange={(event) => { const next = event.target.value; setName(next); const nextId = slug(next); setId(nextId); setRoot(`${project.root}/${nextId}`); }} /></label>
      <label>{t("web.form.id")}<input required pattern="[a-z0-9][a-z0-9-]{0,63}" value={id} onChange={(event) => setId(event.target.value)} /></label>
      <label className="full">{t("web.form.root")}<input required value={root} onChange={(event) => setRoot(event.target.value)} /></label>
      <label className="full">{t("web.form.workflow")}<select value={pipelineId} onChange={(event) => setPipelineId(event.target.value)}>{contracts.pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name} · {pipeline.description}</option>)}</select></label>
    </form>
  </Modal>;
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}
