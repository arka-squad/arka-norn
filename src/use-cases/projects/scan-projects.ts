import type { Project } from "../../domain/project/project.js";
import type { ProjectScanResult, ScanProjectsOptions } from "../../ports/inbound/for-scan-projects.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";

export type ScanProjectsUseCase = (options?: ScanProjectsOptions) => Promise<readonly ProjectScanResult[]>;

export function scanProjectsUseCaseFactory(deps: ProjectsDeps): ScanProjectsUseCase {
  return async (options) => {
    const target = await deps.pathPolicy.canonicalDirectory(options?.target ?? deps.filesystem.homeDir());
    let children: readonly string[];
    try {
      children = await deps.filesystem.readDir(target);
    } catch (error) {
      deps.logger.warn("scanProjects: target unreadable", { target, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
    const results: ProjectScanResult[] = [];
    for (const name of children) {
      const root = deps.filesystem.resolve(target, name);
      try {
        if (!(await deps.filesystem.stat(root)).isDirectory) continue;
      } catch {
        continue;
      }
      const current = await deps.filesystem.exists(deps.filesystem.resolve(root, ".arka-norn", "project.json"));
      const legacy = !current && await deps.filesystem.exists(deps.filesystem.resolve(root, ".arka-norn", "depot.json"));
      if (!current && !legacy) {
        results.push({ root, hasMarker: false });
        continue;
      }
      let project: Project | undefined;
      try {
        project = await deps.projectStore.load(root);
      } catch (error) {
        deps.logger.warn("scanProjects: marker unreadable", { root, error: error instanceof Error ? error.message : String(error) });
      }
      results.push(project === undefined
        ? { root, hasMarker: true, ...(legacy ? { legacyMarker: true } : {}) }
        : { root, hasMarker: true, project, ...(legacy ? { legacyMarker: true } : {}) });
    }
    const known = new Set((await deps.indexStore.load()).map((entry) => entry.id));
    for (const result of results) {
      if (result.project !== undefined && !known.has(result.project.id.value)) {
        await deps.indexStore.add({
          id: result.project.id.value,
          root: result.project.root,
          name: result.project.name,
          updatedAt: result.project.updatedAt,
        });
      }
    }
    return results;
  };
}
