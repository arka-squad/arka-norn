import { useState, type FormEvent } from "react";
import { UserRound } from "lucide-react";

import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function ProfileDialog({ onSaved }: { readonly onSaved: () => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await bridge.savePreferences({ name, email }); onSaved(); } finally { setBusy(false); }
  };
  return <Modal required title={t("web.profile.title")} description={t("web.profile.summary")} icon={<UserRound size={16} />} onClose={() => undefined} footer={<Button form="human-profile" type="submit" variant="primary" disabled={busy}>{t("web.action.confirm")}</Button>}><form id="human-profile" className="form-grid" onSubmit={(event) => void submit(event)}><label>{t("web.settings.name")}<input autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><label>{t("web.settings.email")}<input autoComplete="email" type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label></form></Modal>;
}
