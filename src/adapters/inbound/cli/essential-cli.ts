/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { runGuidedFeatureCommand, type GuidedFeatureCliContext } from "./guided-feature-cli.js";
import type { CliExecution } from "./cli-execution.js";

export type EssentialCliContext = GuidedFeatureCliContext;

const ESSENTIAL_CONFIG = {
  commandName: "essential",
  displayName: "Essential",
  workflowAlias: "essential",
  pipelineId: "arka-norn-essential",
  deliveryStepId: "development_report",
  journey: "brief -> development -> audit -> conditional correction -> validation",
  completionReason: "The latest development report has a passing Essential validation.",
} as const;

export async function runEssentialCommand(argv: readonly string[], context: EssentialCliContext): Promise<CliExecution> {
  return runGuidedFeatureCommand(argv, context, ESSENTIAL_CONFIG);
}
