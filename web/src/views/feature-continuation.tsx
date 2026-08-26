import { Bot, Check, Clipboard, ExternalLink, MessageCircleMore, TriangleAlert, UsersRound } from "lucide-react";
import { useState } from "react";

import type { FeatureContinuationView, ProductPromptTarget, ProductPromptView } from "../../../src/application/web/contracts";
import { projectRoute } from "../app/router";
import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function FeatureContinuation({ continuation, navigate }: { readonly continuation: FeatureContinuationView; readonly navigate: (path: string) => void }) {
  const bridge = useBridge();
  const { t, contractLabel } = useI18n();
  const [prompt, setPrompt] = useState<ProductPromptView>();
  const [busyTarget, setBusyTarget] = useState<ProductPromptTarget>();
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  if (continuation.kind === "complete") return null;
  const isProductStep = continuation.kind === "product";
  const canOpenProduct = isProductStep ? continuation.canPrepareProduct : continuation.canResumeProduct;
  const purpose = isProductStep ? "next_step" as const : "resume" as const;
  const title = continuation.kind === "blocked"
    ? t("web.productNext.blockedTitle")
    : isProductStep ? t("web.productNext.framingTitle") : t("web.productNext.specialistTitle");
  const detail = continuation.kind === "blocked"
    ? t("web.productNext.blockedDetail")
    : isProductStep
      ? t(continuation.orchestrationMode === "automatic" ? "web.productNext.framingAutomatic" : "web.productNext.framingManual")
      : t(continuation.orchestrationMode === "automatic" ? "web.productNext.specialistAutomatic" : "web.productNext.specialistManual");

  const prepare = async (target: ProductPromptTarget) => {
    setBusyTarget(target);
    setError(false);
    setCopied(false);
    try {
      setPrompt(await bridge.prepareProductPrompt(continuation.projectId, continuation.featureId, { target, purpose }));
    } catch {
      setError(true);
    } finally {
      setBusyTarget(undefined);
    }
  };

  const copy = async (open: boolean) => {
    if (prompt === undefined) return;
    try {
      await copyText(prompt.prompt);
      setCopied(true);
      if (open) {
        const target = window.open(prompt.targetUrl, "_blank", "noopener,noreferrer");
        if (target !== null) target.opener = null;
      }
    } catch {
      setCopied(false);
      setError(true);
    }
  };

  return <>
    <section className={`feature-continuation continuation-${continuation.kind}`} aria-labelledby="feature-continuation-title">
      <span className="feature-continuation-icon">{continuation.kind === "blocked" ? <TriangleAlert size={19} /> : <Bot size={19} />}</span>
      <div className="feature-continuation-copy">
        <small>{t("web.productNext.eyebrow")}</small>
        <h2 id="feature-continuation-title">{title}</h2>
        <p>{detail}</p>
        <div className="feature-continuation-facts">
          {continuation.nextStepId === undefined ? null : <span>{contractLabel(continuation.nextStepId)}</span>}
          <span>{continuation.product.status === "missing" ? t("web.productNext.sessionNew") : t("web.productNext.sessionRecovered")}</span>
        </div>
      </div>
      <div className="feature-continuation-actions">
        {canOpenProduct ? <>
          <Button variant="primary" disabled={busyTarget !== undefined} onClick={() => void prepare("chatgpt")}><MessageCircleMore size={15} />{t("web.action.continueChatgpt")}</Button>
          <Button disabled={busyTarget !== undefined} onClick={() => void prepare("claude")}><MessageCircleMore size={15} />{t("web.action.continueClaude")}</Button>
        </> : null}
        {continuation.kind === "specialist" && continuation.orchestrationMode === "automatic" ? <Button onClick={() => navigate(projectRoute(continuation.projectId, "live"))}>{t("web.action.viewLive")}<ExternalLink size={14} /></Button> : null}
        {continuation.kind === "blocked" ? <Button variant="primary" onClick={() => navigate(projectRoute(continuation.projectId, "agents"))}><UsersRound size={15} />{t("web.action.manageAgents")}</Button> : null}
        {busyTarget === undefined ? null : <span className="feature-continuation-busy" role="status">{t("web.productNext.preparing")}</span>}
        {!error ? null : <span className="feature-continuation-error" role="alert">{t("web.productNext.error")}</span>}
      </div>
    </section>
    {prompt === undefined ? null : <Modal
      title={t(prompt.purpose === "next_step" ? "web.productNext.dialogNextTitle" : "web.productNext.dialogResumeTitle")}
      description={t(prompt.reusesAgent ? "web.productNext.dialogReuseDetail" : "web.productNext.dialogCreateDetail")}
      icon={<MessageCircleMore size={17} />}
      size="wide"
      onClose={() => { setPrompt(undefined); setCopied(false); setError(false); }}
      footer={<><span className="modal-footer-copy">{t("web.productNext.noAutomaticSend")}</span><Button onClick={() => void copy(false)}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{t(copied ? "web.action.promptCopied" : "web.action.copyPrompt")}</Button><Button variant="primary" onClick={() => void copy(true)}>{t(prompt.target === "chatgpt" ? "web.action.copyOpenChatgpt" : "web.action.copyOpenClaude")}<ExternalLink size={14} /></Button></>}
    >
      <div className="product-prompt-guide"><strong>{t("web.productNext.promptReady")}</strong><p>{t("web.productNext.promptInstructions")}</p></div>
      <textarea className="product-prompt" readOnly value={prompt.prompt} aria-label={t("web.productNext.promptLabel")} />
    </Modal>}
  </>;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText !== undefined) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard is unavailable.");
}
