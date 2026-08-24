import { useState, type PropsWithChildren, type ReactNode } from "react";
import { AlertTriangle, Folder, FolderOpen, Info } from "lucide-react";

import { useBridge } from "../bridge/context";
import { useI18n } from "../i18n/i18n";
import { Button } from "./ui";

export function FormIntro({ children }: PropsWithChildren) {
  return <div className="modal-intro"><Info size={15} aria-hidden="true" /><span>{children}</span></div>;
}

export function FormError({ message }: { readonly message: string | undefined }) {
  return message === undefined ? null : <p className="form-error" role="alert"><AlertTriangle size={14} aria-hidden="true" />{message}</p>;
}

export function FieldHint({ children }: PropsWithChildren) {
  return <span className="field-hint">{children}</span>;
}

export function FolderPickerField(props: {
  readonly label: string;
  readonly hint: string;
  readonly purpose: "project" | "feature";
  readonly value: string;
  readonly defaultPath?: string;
  readonly onChange: (path: string) => void;
  readonly onError: (message: string | undefined) => void;
}) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const choose = async () => {
    setBusy(true);
    props.onError(undefined);
    try {
      const selected = await bridge.pickFolder({
        purpose: props.purpose,
        ...(props.defaultPath === undefined ? {} : { defaultPath: props.defaultPath }),
      });
      if (selected !== null) props.onChange(selected);
    } catch {
      props.onError(t("web.folder.error"));
    } finally {
      setBusy(false);
    }
  };
  return <div className="folder-field full" role="group" aria-label={props.label}>
    <span className="folder-field-label">{props.label}</span>
    <div className="folder-picker">
      <Folder size={18} aria-hidden="true" />
      <span className={`folder-selection${props.value.length === 0 ? " is-empty" : ""}`}>
        <strong>{props.value.length === 0 ? t("web.folder.none") : folderName(props.value)}</strong>
        {props.value.length === 0 ? null : <code title={props.value}>{props.value}</code>}
      </span>
      <Button type="button" onClick={() => void choose()} disabled={busy}><FolderOpen size={14} />{t(busy ? "web.folder.opening" : "web.folder.choose")}</Button>
    </div>
    <FieldHint>{props.hint}</FieldHint>
  </div>;
}

export function WorkflowOptions({ value, options, onChange }: {
  readonly value: string;
  readonly options: readonly { readonly id: string; readonly name: string; readonly description: string }[];
  readonly onChange: (value: string) => void;
}) {
  return <div className="workflow-options">{options.map((option) => {
    const selected = option.id === value;
    return <label className={`workflow-option${selected ? " selected" : ""}`} key={option.id}>
      <input type="radio" name="workflow" value={option.id} checked={selected} onChange={() => onChange(option.id)} />
      <strong>{option.name}</strong>
      <small>{option.description}</small>
    </label>;
  })}</div>;
}

export function AdvancedFields({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <details className="form-advanced"><summary>{label}</summary><div className="form-advanced-body">{children}</div></details>;
}

function folderName(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/$/u, "").split("/").at(-1) ?? path;
}
