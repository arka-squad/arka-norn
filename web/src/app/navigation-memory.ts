import type { NornBridge } from "../../../src/application/web/contracts";
import { featureRoute, parseRoutePath, projectRoute, routePath } from "./router";

export function isSafeRememberedRoute(value: string | undefined): value is string {
  return value !== undefined && /^\/projects(?:\/[a-z0-9][a-z0-9._-]{0,127})?(?:\/.*)?$/u.test(value);
}

export async function resolveRememberedPath(bridge: NornBridge, remembered: string): Promise<{ readonly path: string; readonly recovered: boolean }> {
  try {
    const target = parseRoutePath(remembered);
    if (target.projectId === undefined) return { path: "/projects", recovered: remembered !== "/projects" };
    const project = await bridge.getProject(target.projectId);
    if (project.lifecycle === "draft" && target.framingId === undefined && target.section !== "overview") {
      return { path: projectRoute(project.id), recovered: true };
    }
    if (target.framingId !== undefined) await bridge.getFraming(project.id, target.framingId);
    if (target.featureId !== undefined) {
      if (!project.features.some((feature) => feature.id === target.featureId)) return { path: projectRoute(project.id), recovered: true };
      if (target.documentId !== undefined) {
        const feature = await bridge.getFeature(project.id, target.featureId);
        if (!feature.documents.some((document) => document.id === target.documentId)) return { path: featureRoute(project.id, target.featureId), recovered: true };
      }
    }
    const normalized = routePath(target);
    return { path: normalized, recovered: normalized !== remembered };
  } catch {
    return { path: "/projects", recovered: true };
  }
}
