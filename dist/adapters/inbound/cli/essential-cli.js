/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { runGuidedFeatureCommand } from "./guided-feature-cli.js";
const ESSENTIAL_CONFIG = {
    commandName: "essential",
    displayName: "Essential",
    workflowAlias: "essential",
    pipelineId: "arka-norn-essential",
    deliveryStepId: "development_report",
    journey: "brief -> development -> audit -> conditional correction -> validation",
    completionReason: "The latest development report has a passing Essential validation.",
};
export async function runEssentialCommand(argv, context) {
    return runGuidedFeatureCommand(argv, context, ESSENTIAL_CONFIG);
}
//# sourceMappingURL=essential-cli.js.map