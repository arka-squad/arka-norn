import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { HttpNornBridge } from "./bridge/http-bridge";
import "./styles/fonts.css";
import "./styles/brand.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/views.css";
import "./styles/onboarding.css";

const token = sessionToken();
const root = document.getElementById("root");
if (root === null) throw new Error("Root element is missing.");
document.documentElement.dataset.theme = localStorage.getItem("arka-norn-theme") === "light" ? "light" : "dark";

if (token === undefined) {
  root.innerHTML = '<main class="fatal-session"><h1>Norn Web session unavailable</h1><p>Restart <code>arka-norn web</code> to open a secured local session.</p></main>';
} else {
  const bridge = new HttpNornBridge(token);
  void bridge.getPreferences().then((preferences) => {
    createRoot(root).render(<StrictMode><App bridge={bridge} initialPreferences={preferences} /></StrictMode>);
  }).catch(() => {
    root.innerHTML = '<main class="fatal-session"><h1>Norn Web session rejected</h1><p>Restart <code>arka-norn web</code>.</p></main>';
  });
}

function sessionToken(): string | undefined {
  const hash = window.location.hash.replace(/^#/, "");
  const initial = hash.startsWith("token=") ? new URLSearchParams(hash).get("token") ?? undefined : undefined;
  if (initial !== undefined) {
    sessionStorage.setItem("arka-norn-web-token", initial);
    history.replaceState(null, "", `${location.pathname}${location.search}#/projects`);
  }
  return initial ?? sessionStorage.getItem("arka-norn-web-token") ?? undefined;
}
