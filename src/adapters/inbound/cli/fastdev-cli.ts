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

import { runGuidedFeatureCommand, type GuidedFeatureCliContext } from "./guided-feature-cli.js";
import type { CliExecution } from "./cli-execution.js";

export type FastDevCliContext = GuidedFeatureCliContext;

const FASTDEV_CONFIG = {
  commandName: "fastdev",
  displayName: "FastDev",
  workflowAlias: "fastdev",
  pipelineId: "arka-norn-fastdev",
  deliveryStepId: "development_report",
  journey: "brief -> development -> audit -> conditional correction -> validation",
  completionReason: "The latest development report has a passing FastDev validation.",
} as const;

export async function runFastDevCommand(argv: readonly string[], context: FastDevCliContext): Promise<CliExecution> {
  return runGuidedFeatureCommand(argv, context, FASTDEV_CONFIG);
}
