/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import type { PipelineWorkflow } from "../../../domain/pipeline/pipeline-catalog.js";
import type { CliExecution } from "./cli-execution.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";

export async function runWorkflowCommand(argv: readonly string[], frameworkRoot: string): Promise<CliExecution> {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  try {
    const runtime = createPipelineRuntime(frameworkRoot);
    if (action === "list") {
      parseStrictArguments(rest, { options: { json: "boolean" }, minPositionals: 0, maxPositionals: 0 });
      return success("workflow.list", await runtime.listWorkflows(), json);
    }
    if (action === "show") {
      const parsed = parseStrictArguments(rest, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
      return success("workflow.show", await runtime.showWorkflow(parsed.positionals[0]!), json);
    }
    throw new CliUsageError("workflow action must be list or show");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliUsageError ? 64 : 3;
    return json
      ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command: `workflow.${action ?? "unknown"}`, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
      : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
  }
}

function success(command: string, data: PipelineWorkflow | readonly PipelineWorkflow[], json: boolean): CliExecution {
  if (json) return { code: 0, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: true, data, errors: [], warnings: [] })}\n`, stderr: "" };
  const workflows: readonly PipelineWorkflow[] = Array.isArray(data) ? data as readonly PipelineWorkflow[] : [data as PipelineWorkflow];
  const lines = workflows.flatMap((workflow) => [
    `${workflow.id} (${workflow.aliases.join(", ") || "sans alias"}) — ${workflow.name}`,
    `  ${workflow.description}`,
    `  ${workflow.steps.map((step) => step.id).join(" → ")}`,
  ]);
  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}
