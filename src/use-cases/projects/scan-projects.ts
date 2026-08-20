import type { Project } from "../../domain/project/project.js";
import type { ProjectScanResult, ScanProjectsOptions } from "../../ports/inbound/for-scan-projects.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";
import { loadIndexedProject } from "./_shared/verified-project.js";

export type ScanProjectsUseCase = (options?: ScanProjectsOptions) => Promise<readonly ProjectScanResult[]>;

export function scanProjectsUseCaseFactory(deps: ProjectsDeps): ScanProjectsUseCase {
  return async (options) => {
    const target = await deps.pathPolicy.canonicalDirectory(options?.target ?? deps.filesystem.homeDir());
    const targetCurrent = await deps.filesystem.exists(deps.filesystem.resolve(target, ".arka-norn", "project.json"));
    const targetLegacy = !targetCurrent && await deps.filesystem.exists(deps.filesystem.resolve(target, ".arka-norn", "depot.json"));
    let roots: readonly string[];
    if (targetCurrent || targetLegacy) {
      roots = [target];
    } else {
      let children: readonly string[];
      try {
        children = await deps.filesystem.readDir(target);
      } catch (error) {
        deps.logger.warn("scanProjects: target unreadable", { target, error: error instanceof Error ? error.message : String(error) });
        return [];
      }
      const discovered: string[] = [];
      for (const name of children) {
        const root = deps.filesystem.resolve(target, name);
        try {
          if ((await deps.filesystem.stat(root)).isDirectory) discovered.push(root);
        } catch {
          continue;
        }
      }
      roots = discovered;
    }
    const results: ProjectScanResult[] = [];
    for (const root of roots) {
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
    const known = new Map((await deps.indexStore.load()).map((entry) => [entry.id, entry] as const));
    for (const result of results) {
      if (result.project === undefined) continue;
      const entry = {
        id: result.project.id.value,
        root: result.project.root,
        name: result.project.name,
        updatedAt: result.project.updatedAt,
      };
      const indexed = known.get(entry.id);
      if (indexed === undefined) {
        await deps.indexStore.add(entry);
        known.set(entry.id, entry);
        continue;
      }
      if (indexed.root === entry.root) continue;
      let duplicateIsActive = false;
      try {
        duplicateIsActive = (await loadIndexedProject(deps, indexed)).id.value === entry.id;
      } catch {
        duplicateIsActive = false;
      }
      if (duplicateIsActive) {
        deps.logger.warn("scanProjects: duplicate portable marker ignored", { id: entry.id, indexedRoot: indexed.root, candidateRoot: entry.root });
        continue;
      }
      await deps.indexStore.upsert(entry);
      known.set(entry.id, entry);
    }
    return results;
  };
}
