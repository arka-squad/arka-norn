import { useState } from "react";
import { Braces, Check, Copy } from "lucide-react";

import { useI18n } from "../i18n/i18n";

export function JsonPanel({ value, compact = false }: { readonly value: unknown; readonly compact?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const source = JSON.stringify(value, null, 2);
  const copy = async () => {
    await navigator.clipboard?.writeText(source);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <div className={compact ? "json-panel compact" : "json-panel"}>
    <header><span><Braces size={14} />{t("web.document.rawContract")}</span><small>{t("web.document.readOnly")}</small><button onClick={() => void copy()}>{copied ? <Check size={13} /> : <Copy size={13} />}{t(copied ? "web.action.copied" : "web.action.copy")}</button></header>
    <pre tabIndex={0}><code>{source}</code></pre>
  </div>;
}
