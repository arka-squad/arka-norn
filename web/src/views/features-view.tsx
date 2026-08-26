import { useState, type FormEvent } from "react";
import { Compass, Plus } from "lucide-react";

import type { ProjectOverview } from "../../../src/application/web/contracts";
import { useBridge } from "../bridge/context";
import { framingRoute } from "../app/router";
import { Modal } from "../components/modal";
import { Button, PageTitle } from "../components/ui";
import { FieldHint, FormError, FormIntro } from "../components/guided-form";
import { useI18n } from "../i18n/i18n";
import { FeatureTable } from "./project-overview";

export function FeaturesView({ project, navigate, onCreated }: { readonly project: ProjectOverview; readonly navigate: (path: string) => void; readonly onCreated: () => void }) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  return <div className="page"><PageTitle title={t("web.nav.features")} summary={`${project.features.length} ${t("web.feature.tracked")}`} actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} />{t("web.framing.newFeature")}</Button>} /><FeatureTable project={project} navigate={navigate} />{creating ? <CreateFeatureDialog project={project} onClose={() => setCreating(false)} onStarted={(framingId) => { onCreated(); navigate(framingRoute(project.id, framingId)); }} /> : null}</div>;
}

function CreateFeatureDialog({ project, onClose, onStarted }: { readonly project: ProjectOverview; readonly onClose: () => void; readonly onStarted: (framingId: string) => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length === 0) return;
    setBusy(true);
    setError(undefined);
    try { onStarted((await bridge.startFraming(project.id, { newFeatureTitle: name.trim() })).framingId); }
    catch { setError(t("web.error.actionRejected")); }
    finally { setBusy(false); }
  };
  return <Modal title={t("web.framing.newFeature")} description={t("web.framing.newFeatureDetail")} icon={<Compass size={16} />} onClose={onClose} footer={<><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button form="create-feature" type="submit" variant="primary" disabled={busy || name.trim().length === 0}>{t("web.framing.start")}</Button></>}>
    <FormIntro>{t("web.framing.newFeatureGuidance")}</FormIntro>
    <form id="create-feature" className="form-grid" onSubmit={(event) => void submit(event)}>
      <label className="full">{t("web.framing.expectedOutcome")}<textarea autoFocus required maxLength={256} rows={3} value={name} onChange={(event) => setName(event.target.value)} /><FieldHint>{t("web.framing.expectedOutcomeHint")}</FieldHint></label>
      <FormError message={error} />
    </form>
  </Modal>;
}
