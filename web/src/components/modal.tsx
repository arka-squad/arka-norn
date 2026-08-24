import { useEffect, useRef, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CloseButton } from "./ui";

interface ModalProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly footer?: ReactNode;
  readonly onClose: () => void;
  readonly required?: boolean;
}

export function Modal({ title, description, icon, children, footer, onClose, required = false }: PropsWithChildren<ModalProps>) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = dialog.current?.querySelector<HTMLElement>(".modal-content input, .modal-content select, .modal-content textarea, .modal-content button")
      ?? dialog.current?.querySelector<HTMLElement>("button");
    first?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !required) onClose();
      if (event.key !== "Tab" || dialog.current === null) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>("input, select, textarea, button, [href]")].filter((item) => !item.hasAttribute("disabled"));
      const firstItem = focusable[0];
      const lastItem = focusable.at(-1);
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem?.focus(); }
      if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem?.focus(); }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, required]);
  return createPortal(<div className={`modal-backdrop${required ? " is-required" : ""}`} role="presentation" onMouseDown={(event) => {
    if (!required && event.target === event.currentTarget) onClose();
  }}><div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" {...(description === undefined ? {} : { "aria-describedby": "modal-description" })}>
    <header>{icon === undefined ? null : <span className="modal-icon">{icon}</span>}<div className="modal-heading"><h2 id="modal-title">{title}</h2>{description === undefined ? null : <p id="modal-description">{description}</p>}</div>{required ? null : <CloseButton onClick={onClose} />}</header>
    <div className="modal-content">{children}</div>{footer === undefined ? null : <footer>{footer}</footer>}
  </div></div>, document.body);
}
