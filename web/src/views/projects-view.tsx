import { useState, type FormEvent } from "react";
import { FolderKanban, Plus } from "lucide-react";

import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button, EmptyState, ErrorState, LoadingState, PageTitle, StatusBadge } from "../components/ui";
import { useAsync } from "../hooks/use-async";
import { useI18n } from "../i18n/i18n";
import { projectRoute } from "../app/router";

export function ProjectsView({ navigate }: { readonly navigate: (path: string) => void }) {
  const bridge = useBridge();
  const { t, date } = useI18n();
  const projects = useAsync(() => bridge.listProjects(), [bridge]);
  const [creating, setCreating] = useState(false);
  if (projects.loading && projects.data === undefined) return <LoadingState />;
  if (projects.error !== undefined) return <ErrorState retry={projects.reload} />;
  return <div className="page">
    <PageTitle title={t("web.projects.title")} summary={t("web.projects.summary")} actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} />{t("web.action.createProject")}</Button>} />
    {projects.data?.length === 0 ? <EmptyState>{t("web.projects.empty")}</EmptyState> : <div className="project-list">{projects.data?.map((project) => <button className="project-row" key={project.id} onClick={() => navigate(projectRoute(project.id))}>
      <span className="project-icon"><FolderKanban size={20} /></span>
      <span className="project-main"><strong>{project.name}</strong><small>{project.root}</small></span>
      <span className="project-meta"><StatusBadge health={project.health} /><small>{project.featureCount} Features · {date(project.updatedAt)}</small></span>
    </button>)}</div>}
    {creating ? <CreateProjectDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(projectRoute(id))} /> : null}
  </div>;
}

function CreateProjectDialog({ onClose, onCreated }: { readonly onClose: () => void; readonly onCreated: (id: string) => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [root, setRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { onCreated((await bridge.createProject({ id, name, root })).id); } finally { setBusy(false); }
  };
  return <Modal title={t("web.action.createProject")} onClose={onClose} footer={<><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button form="create-project" type="submit" variant="primary" disabled={busy}>{t("web.action.confirm")}</Button></>}>
    <form id="create-project" className="form-grid" onSubmit={(event) => void submit(event)}>
      <label>{t("web.form.name")}<input required maxLength={256} value={name} onChange={(event) => { setName(event.target.value); if (id === "" || id === slug(name)) setId(slug(event.target.value)); }} /></label>
      <label>{t("web.form.id")}<input required pattern="[a-z0-9][a-z0-9-]{0,63}" value={id} onChange={(event) => setId(event.target.value)} /></label>
      <label className="full">{t("web.form.root")}<input required value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/absolute/project/folder" /></label>
    </form>
  </Modal>;
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}
