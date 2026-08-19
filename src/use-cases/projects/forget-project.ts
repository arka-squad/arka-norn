import { ProjectNotFoundError } from "../../domain/errors.js";
import type { ProjectId } from "../../domain/project/project-id.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";

export type ForgetProjectUseCase = (id: ProjectId) => Promise<void>;

export function forgetProjectUseCaseFactory(deps: ProjectsDeps): ForgetProjectUseCase {
  return async (id) => {
    const entry = await deps.indexStore.find(id);
    if (entry === undefined) throw new ProjectNotFoundError(id.value);
    await deps.indexStore.remove(id);
    deps.logger.info("forgetProject: project removed from index; filesystem untouched", { id: id.value, root: entry.root });
  };
}
