import { useState, type FormEvent } from "react";
import { Boxes, Plus } from "lucide-react";

import type { ProjectOverview } from "../../../src/application/web/contracts";
import { contracts } from "../generated/contracts";
import { useBridge } from "../bridge/context";
import { featureRoute } from "../app/router";
import { Modal } from "../components/modal";
import { Button, PageTitle } from "../components/ui";
import { AdvancedFields, FieldHint, FolderPickerField, FormError, FormIntro, WorkflowOptions } from "../components/guided-form";
import { useI18n } from "../i18n/i18n";
import { featureRoot, slug } from "../onboarding/onboarding-model";
import { FeatureTable } from "./project-overview";

export function FeaturesView({ project, navigate, onCreated }: { readonly project: ProjectOverview; readonly navigate: (path: string) => void; readonly onCreated: () => void }) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  return <div className="page"><PageTitle title={t("web.nav.features")} summary={`${project.features.length} ${t("web.feature.tracked")}`} actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} />{t("web.action.createFeature")}</Button>} /><FeatureTable project={project} navigate={navigate} />{creating ? <CreateFeatureDialog project={project} onClose={() => setCreating(false)} onCreated={(id) => { onCreated(); navigate(featureRoute(project.id, id)); }} /> : null}</div>;
}

function CreateFeatureDialog({ project, onClose, onCreated }: { readonly project: ProjectOverview; readonly onClose: () => void; readonly onCreated: (id: string) => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [root, setRoot] = useState("");
  const [pipelineId, setPipelineId] = useState<string>(contracts.defaultPipelineId);
  const [busy, setBusy] = useState(false);
  const [customRoot, setCustomRoot] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.length === 0 || id.length === 0 || root.length === 0) return;
    setBusy(true);
    setError(undefined);
    try { onCreated((await bridge.createFeature(project.id, { id, name, root, pipelineId })).id); }
    catch { setError(t("web.error.actionRejected")); }
    finally { setBusy(false); }
  };
  return <Modal title={t("web.action.createFeature")} description={t("web.feature.createDescription")} icon={<Boxes size={16} />} onClose={onClose} footer={<><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button form="create-feature" type="submit" variant="primary" disabled={busy || name.length === 0 || id.length === 0 || root.length === 0}>{t("web.action.addFeature")}</Button></>}>
    <FormIntro>{t("web.feature.createGuidance")}</FormIntro>
    <form id="create-feature" className="form-grid" onSubmit={(event) => void submit(event)}>
      <label className="full">{t("web.form.name")}<input required maxLength={256} value={name} onChange={(event) => { const next = event.target.value; const nextId = slug(next); setName(next); setId(nextId); if (!customRoot) setRoot(nextId.length === 0 ? "" : featureRoot(project.root, nextId)); }} /><FieldHint>{t("web.feature.nameHint")}</FieldHint></label>
      <FolderPickerField label={t("web.form.root")} hint={t("web.feature.folderHint")} purpose="feature" defaultPath={project.root} value={root} onChange={(path) => { setRoot(path); setCustomRoot(true); }} onError={setError} />
      <div className="full folder-field"><span className="folder-field-label">{t("web.form.workflow")}</span><WorkflowOptions value={pipelineId} options={contracts.pipelines} onChange={setPipelineId} /><FieldHint>{t("web.feature.workflowHint")}</FieldHint></div>
      <AdvancedFields label={t("web.form.technicalDetails")}><label>{t("web.form.id")}<input required pattern="[a-z0-9][a-z0-9-]{0,63}" value={id} onChange={(event) => setId(event.target.value)} /><FieldHint>{t("web.form.idHint")}</FieldHint></label></AdvancedFields>
      <FormError message={error} />
    </form>
  </Modal>;
}
