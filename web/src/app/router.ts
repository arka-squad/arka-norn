import { useEffect, useState } from "react";

export interface AppRoute {
  readonly projectId?: string;
  readonly section: "projects" | "overview" | "features" | "documents" | "decisions" | "audits" | "agents" | "live" | "graph" | "settings";
  readonly featureId?: string;
  readonly documentId?: string;
}

export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const listener = () => setRoute(readRoute());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  return { route, navigate };
}

export function projectRoute(projectId: string, section = "overview"): string {
  return `/projects/${encodeURIComponent(projectId)}/${section}`;
}

export function featureRoute(projectId: string, featureId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}`;
}

export function documentRoute(projectId: string, featureId: string, documentId: string): string {
  return `${featureRoute(projectId, featureId)}/documents/${encodeURIComponent(documentId)}`;
}

function navigate(path: string): void {
  window.location.hash = `#${path.startsWith("/") ? path : `/${path}`}`;
}

function readRoute(): AppRoute {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "projects" || parts[1] === undefined) return { section: "projects" };
  const projectId = parts[1];
  if (parts[2] === "features" && parts[3] !== undefined) {
    return {
      projectId,
      section: "features",
      featureId: parts[3],
      ...(parts[4] === "documents" && parts[5] !== undefined ? { documentId: parts[5] } : {}),
    };
  }
  const allowed: readonly AppRoute["section"][] = ["overview", "features", "documents", "decisions", "audits", "agents", "live", "graph", "settings"];
  const section = allowed.includes(parts[2] as AppRoute["section"]) ? parts[2] as AppRoute["section"] : "overview";
  return { projectId, section };
}
