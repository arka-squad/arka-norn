import { contracts } from "../generated/contracts";

export function pipelineName(id: string): string {
  return contracts.pipelines.find((pipeline) => pipeline.id === id)?.name ?? "—";
}
