import { FeatureNotFoundError, FeatureWorkflowImmutableError } from "../../domain/errors.js";
import type { SetFeatureWorkflowInput } from "../../ports/inbound/for-features.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";

export function setFeatureWorkflowUseCaseFactory(deps: FeaturesDeps) {
  return async (input: SetFeatureWorkflowInput) => {
    const entry = await deps.indexStore.find(input.id);
    if (entry === undefined) throw new FeatureNotFoundError(input.id.value);
    const feature = await deps.featureStore.load(entry.root);
    const recognized = new Set(input.recognizedDocumentTypes);
    for (const name of await deps.filesystem.readDir(feature.root)) {
      if (!name.endsWith(".json")) continue;
      const filePath = deps.filesystem.resolve(feature.root, name);
      if (!(await deps.filesystem.stat(filePath)).isFile) continue;
      let type: unknown;
      try {
        const document = JSON.parse(await deps.filesystem.readFile(filePath)) as unknown;
        type = typeof document === "object" && document !== null && !Array.isArray(document)
          ? (document as Readonly<Record<string, unknown>>)["type"]
          : undefined;
      } catch {
        continue;
      }
      if (typeof type === "string" && recognized.has(type)) throw new FeatureWorkflowImmutableError(feature.id.value, type);
    }
    const updated = feature.withPipelineId(input.pipelineId, deps.clock.now());
    await deps.featureStore.save(updated);
    await deps.indexStore.upsert({
      id: updated.id.value,
      projectId: updated.projectId.value,
      root: updated.root,
      name: updated.name,
      updatedAt: updated.updatedAt,
    });
    return updated;
  };
}
