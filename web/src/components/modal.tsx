import { useEffect, useRef, type PropsWithChildren, type ReactNode } from "react";

import { CloseButton } from "./ui";

export function Modal({ title, children, footer, onClose, required = false }: PropsWithChildren<{ readonly title: string; readonly footer?: ReactNode; readonly onClose: () => void; readonly required?: boolean }>) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
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
    return () => document.removeEventListener("keydown", listener);
  }, [onClose, required]);
  return <div className="modal-backdrop" role="presentation"><div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2>{required ? null : <CloseButton onClick={onClose} />}</header><div className="modal-content">{children}</div>{footer === undefined ? null : <footer>{footer}</footer>}</div></div>;
}
