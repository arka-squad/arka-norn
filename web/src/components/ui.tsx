import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Check, Circle, LoaderCircle, RefreshCw, X } from "lucide-react";

import type { TrackingHealth } from "../../../src/application/web/contracts";
import { useI18n } from "../i18n/i18n";

export function Button({ variant = "default", children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: "default" | "primary" | "danger" | "ghost" }>) {
  return <button className={`button button-${variant}`} {...props}>{children}</button>;
}

export function IconButton({ label, children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string }>) {
  return <button className="icon-button" aria-label={label} title={label} {...props}>{children}</button>;
}

export function StatusBadge({ health, label }: { readonly health: TrackingHealth; readonly label?: string }) {
  const { t } = useI18n();
  const text = label ?? t(`web.status.${health}`);
  return <span className={`status-badge status-${health}`}><span className="status-dot" />{text}</span>;
}

export function PageTitle({ title, summary, actions }: { readonly title: string; readonly summary?: string; readonly actions?: ReactNode }) {
  return <header className="page-title"><div><h1>{title}</h1>{summary === undefined ? null : <p>{summary}</p>}</div>{actions === undefined ? null : <div className="page-actions">{actions}</div>}</header>;
}

export function EmptyState({ children }: PropsWithChildren) {
  return <div className="empty-state"><Circle size={24} aria-hidden="true" /><p>{children}</p></div>;
}

export function LoadingState() {
  const { t } = useI18n();
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={20} />{t("web.common.loading")}</div>;
}

export function ErrorState({ retry }: { readonly retry?: () => void }) {
  const { t } = useI18n();
  return <div className="error-state" role="alert"><AlertTriangle size={24} /><div><strong>{t("web.error.title")}</strong><p>{t("web.error.generic")}</p></div>{retry === undefined ? null : <IconButton label={t("web.action.refresh")} onClick={retry}><RefreshCw size={16} /></IconButton>}</div>;
}

export function BackButton({ onClick }: { readonly onClick: () => void }) {
  const { t } = useI18n();
  return <IconButton label={t("web.action.back")} onClick={onClick}><ArrowLeft size={17} /></IconButton>;
}

export function CloseButton({ onClick }: { readonly onClick: () => void }) {
  const { t } = useI18n();
  return <IconButton label={t("web.action.close")} onClick={onClick}><X size={17} /></IconButton>;
}

export function CheckMark() { return <Check size={15} aria-hidden="true" />; }
