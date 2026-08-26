import { useState, type FormEvent } from "react";
import { FolderKanban, FolderPlus, Plus } from "lucide-react";

import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button, EmptyState, ErrorState, LoadingState, PageTitle, StatusBadge } from "../components/ui";
import { FolderPickerField, FormError, FormIntro } from "../components/guided-form";
import { useAsync } from "../hooks/use-async";
import { useI18n } from "../i18n/i18n";
import { projectRoute } from "../app/router";

export function ProjectsView({ navigate }: { readonly navigate: (path: string) => void }) {
  const bridge = useBridge();
  const { t, date } = useI18n();
  const projects = useAsync(() => bridge.listProjects(), [bridge]);
  const [creating, setCreating] = useState(false);
  if (projects.loading && projects.data === undefined) return <LoadingState />;
  if (projects.error !== undefined) return <ErrorState error={projects.error} retry={projects.reload} />;
  return <div className="page">
    <PageTitle title={t("web.projects.title")} summary={t("web.projects.summary")} actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} />{t("web.action.createProject")}</Button>} />
    {projects.data?.length === 0 ? <EmptyState title={t("web.projects.empty")} description={t("web.projects.emptyDetail")} icon={<FolderKanban size={16} />} /> : <div className="project-list">{projects.data?.map((project) => <button className="project-row" key={project.id} onClick={() => navigate(projectRoute(project.id))}>
      <span className="project-icon"><FolderKanban size={20} /></span>
      <span className="project-main"><strong>{project.name}{project.lifecycle === "draft" ? <em className="project-draft-badge">{t("web.project.draft")}</em> : null}</strong><small>{project.root}</small>{project.framing === undefined ? null : <small>{project.framing.nextMove}</small>}</span>
      <span className="project-meta"><StatusBadge health={project.health} /><small>{project.lifecycle === "draft" ? t("web.project.framingOnly") : `${project.featureCount} Features`} · {date(project.updatedAt)}</small></span>
    </button>)}</div>}
    {creating ? <CreateProjectDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(projectRoute(id))} /> : null}
  </div>;
}

function CreateProjectDialog({ onClose, onCreated }: { readonly onClose: () => void; readonly onCreated: (id: string) => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [root, setRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (root.length === 0) return;
    setBusy(true);
    setError(undefined);
    try { onCreated((await bridge.enterProjectFraming({ root })).id); }
    catch { setError(t("web.error.actionRejected")); }
    finally { setBusy(false); }
  };
  return <Modal title={t("web.action.createProject")} description={t("web.projects.createDescription")} icon={<FolderPlus size={16} />} onClose={onClose} footer={<><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button form="create-project" type="submit" variant="primary" disabled={busy || root.length === 0}>{t("web.action.continueFraming")}</Button></>}>
    <FormIntro>{t("web.projects.createGuidance")}</FormIntro>
    <form id="create-project" className="form-grid" onSubmit={(event) => void submit(event)}>
      <FolderPickerField label={t("web.form.root")} hint={t("web.projects.folderHint")} purpose="project" value={root} onChange={setRoot} onError={setError} />
      <FormError message={error} />
    </form>
  </Modal>;
}
