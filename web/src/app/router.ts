import { useEffect, useState } from "react";

export interface AppRoute {
  readonly projectId?: string;
  readonly section: "projects" | "overview" | "framing" | "features" | "documents" | "decisions" | "audits" | "agents" | "live" | "graph" | "settings";
  readonly featureId?: string;
  readonly documentId?: string;
  readonly framingId?: string;
  readonly framingView?: "plan" | "evidence" | "map" | "history";
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

export function framingRoute(projectId: string, framingId: string, view: "plan" | "evidence" | "map" | "history" = "plan"): string {
  return `/projects/${encodeURIComponent(projectId)}/framing/${encodeURIComponent(framingId)}/${view}`;
}

export function routePath(route: AppRoute): string {
  if (route.projectId === undefined) return "/projects";
  if (route.framingId !== undefined) return framingRoute(route.projectId, route.framingId, route.framingView ?? "plan");
  if (route.featureId !== undefined) {
    return route.documentId === undefined
      ? featureRoute(route.projectId, route.featureId)
      : documentRoute(route.projectId, route.featureId, route.documentId);
  }
  return projectRoute(route.projectId, route.section);
}

export function parseRoutePath(path: string): AppRoute {
  return parseRoute(path);
}

function navigate(path: string): void {
  window.location.hash = `#${path.startsWith("/") ? path : `/${path}`}`;
}

function readRoute(): AppRoute {
  return parseRoute(window.location.hash);
}

function parseRoute(path: string): AppRoute {
  const parts = path.replace(/^#\/?/, "").replace(/^\//, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "projects" || parts[1] === undefined) return { section: "projects" };
  const projectId = parts[1];
  if (parts[2] === "framing" && parts[3] !== undefined) {
    const view = parts[4] === "evidence" || parts[4] === "map" || parts[4] === "history" ? parts[4] : "plan";
    return { projectId, section: "framing", framingId: parts[3], framingView: view };
  }
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
