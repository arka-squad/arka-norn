/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const skillsRoot = resolve(root, "skills-src");
const catalogRoot = resolve(skillsRoot, "catalog");
const all = ["all"];
const core = ["all", "core", "delivery", "product", "architecture", "audit", "dev", "qa"];

const skills = [
  framingSkill(),
  skill("arka-audit", "Arka repository audit", "Run a transverse repository audit outside a Feature Pipeline.", "transversal.audit", ["all", "core", "product", "architecture", "audit"]),
  skill("arka-product", "Arka Product control", "Coordinate Product decisions, roles, prompts and handoffs.", "core.product", ["all", "core", "delivery", "product"], "2.1.0"),
  guided("arka-fastdev", "FastDev guided rework", "fastdev", "arka-norn-fastdev", ["rework_brief", "development_report", "delivery_audit", "delivery_validation"], ["all", "core", "delivery", "audit", "dev", "qa"]),
  guided("arka-essential", "Essential guided Feature", "essential", "arka-norn-essential", ["feature_brief", "technical_contract_appendix", "development_report", "delivery_audit", "delivery_validation"], core),
  skill("arka-framework-mastery", "Complete workflow mastery", "Drive one verified phase of the Complete workflow.", "core.mastery", core),
  skill("arka-framework-status", "Pipeline status", "Inspect the verified Pipeline state and exact next action.", "core.status", core),
  skill("arka-framework-scaffold", "Pipeline scaffold", "Generate a signed v5 document scaffold for one canonical step.", "core.scaffold", core),
  skill("arka-framework-validate", "Document validation", "Validate schema, sentinels, identity and document relations.", "core.validate", core),
  skill("arka-framework-handoff", "Agent handoff", "Produce a bounded, signed handoff for another Agent.", "transversal.handoff", core),
  skill("arka-framework-concept", "Feature concept", "Frame Feature value, boundaries and testable assumptions.", "concept", ["all", "product"]),
  skill("arka-framework-plan", "Delivery plan", "Turn a validated concept into ordered, testable batches.", "plan", ["all", "delivery", "product"]),
  skill("arka-framework-technical-appendix", "Technical contract appendix", "Freeze external and cross-boundary technical contracts.", "technical_contract_appendix", ["all", "architecture"]),
  skill("arka-framework-audit", "Current state audit", "Establish reproducible current-state evidence without hidden fixes.", "current_state_audit", ["all", "delivery", "architecture", "audit"]),
  skill("arka-framework-invariants", "Frozen invariants", "Freeze non-negotiable rules derived from verified evidence.", "frozen_invariants", ["all", "delivery", "architecture", "audit"]),
  skill("arka-framework-debt-register", "Debt register", "Record accepted gaps with ownership, priority and traceability.", "debt_register", ["all", "delivery", "product"]),
  skill("arka-framework-tasks", "Agent tasks", "Split an authorized batch into bounded, verifiable Agent tasks.", "agent_task", ["all", "delivery", "product"]),
  skill("arka-framework-integration-specification", "Integration specification", "Connect tasks, contracts, invariants and executable tests.", "technical_integration_specification", ["all", "delivery", "architecture", "dev"]),
  skill("arka-framework-development", "Development delivery", "Implement one authorized scope with tests and a signed report.", "development_report", ["all", "delivery", "dev"]),
  skill("arka-framework-qa-review", "Independent QA review", "Review the latest development report and issue an explicit verdict.", "qa_review", ["all", "delivery", "qa"]),
  skill("arka-git-steward", "Git stewardship", "Protect the Git baseline, ownership manifest and explicit commit scope.", "git_steward", ["all", "delivery", "dev", "qa"]),
];

mkdirSync(catalogRoot, { recursive: true });
for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".json")) rmSync(resolve(skillsRoot, entry.name));
}

const entries = [];
for (const config of skills) {
  const definition = definitionFor(config);
  const source = `${JSON.stringify(definition, null, 2)}\n`;
  const sourceName = `${config.name}.json`;
  writeFileSync(resolve(skillsRoot, sourceName), source, "utf8");
  entries.push({
    name: config.name,
    version: config.version,
    source: sourceName,
    checksum: createHash("sha256").update(source, "utf8").digest("hex"),
    step: config.step,
    profiles: config.profiles,
  });
}

const catalog = {
  schemaVersion: 2,
  catalogVersion: "2.3.2",
  profiles: {
    all: "21 skills: complete catalog",
    core: "10 bootstrap and Product control skills",
    delivery: "18 preparation, development and QA skills",
    product: "13 Product planning and coordination skills",
    architecture: "12 contract and invariant skills",
    audit: "11 evidence and verification skills",
    dev: "11 implementation and delivery skills",
    qa: "10 review and validation skills",
  },
  skills: entries,
};
writeFileSync(resolve(catalogRoot, "skills.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

function skill(name, title, summary, step, profiles = all, version = "2.1.0") {
  return { name, title, summary, step, profiles, version, mode: "pipeline" };
}

function guided(name, title, command, pipelineId, steps, profiles) {
  return { name, title, summary: `Execute exactly one calculated ${title} phase.`, step: `core.${command}`, profiles, version: "2.1.0", mode: "guided", command, pipelineId, steps };
}

function framingSkill() {
  return {
    name: "arka-norn",
    title: "Arka Norn framing",
    summary: "Enter or resume the live framing plan for a Project or Feature.",
    step: "core.bootstrap",
    profiles: core,
    version: "2.3.2",
    mode: "framing",
  };
}

function definitionFor(config) {
  if (config.mode === "framing") return framingDefinition(config);
  const useWhen = config.mode === "guided"
    ? `Use when a Feature uses ${config.pipelineId}, or when \`arka-norn ${config.command} next\` identifies the next phase.`
    : `Use when the verified Pipeline action or Product handoff assigns the ${config.step} responsibility.`;
  const doNotUseWhen = "Do not use for a different calculated phase, an unverified Agent scope, or to bypass schema and business validation.";
  return {
    name: config.name,
    repoTitle: config.title,
    globalTitle: `Skill - ${config.title}`,
    summary: config.summary,
    useWhen,
    doNotUseWhen,
    triggers: `${useWhen} English triggers include "continue the Feature" and "run the next phase". French triggers include "continuer la Feature" and "exécuter la prochaine étape". Resolve locale, Project, Feature, Agent and phase through the CLI before acting.`,
    interface: {
      displayName: config.title,
      shortDescription: compact(config.summary),
      defaultPrompt: `Use $${config.name} to execute only the currently calculated phase.`,
    },
    allowedTools: ["Read", "Bash", "Grep", "Glob"],
    whenToUse: [useWhen, "The work must produce one signed and mechanically validated artifact."],
    whenNotToUse: [doNotUseWhen, "The current Agent identity or session cannot be verified."],
    inputs: [
      { required: true, name: "feature", description: "Exact managed Feature identifier." },
      { required: true, name: "session_id", description: "Specialized Agent session supplied by Product control." },
      { required: false, name: "agent_id", description: "Explicit active identity; otherwise use the Project session binding." },
    ],
    inputNotes: `Never infer the phase from filenames. Machine-readable CLI data is the source of truth.${config.mode === "guided" ? ` Canonical phases: ${config.steps.join(", ")}.` : ""}`,
    references: [
      "`{{FRAMEWORK_DIR}}/docs/agent-guide.md` - Agent protocol and locale behavior",
      "`{{FRAMEWORK_DIR}}/schemas/` - canonical v5 document contracts",
      "`{{FRAMEWORK_DIR}}/pipelines/catalog.json` - canonical workflow catalog",
    ],
    procedure: procedureFor(config),
    outputFormat: "Report the verified Project, Feature, Agent/session, locale, executed phase, signed document, validation result, evidence and observed next command. Do not execute a second phase in the same invocation.",
  };
}

function framingDefinition(config) {
  return {
    name: config.name,
    repoTitle: config.title,
    globalTitle: `Skill - ${config.title}`,
    summary: config.summary,
    useWhen: "Use when a user launches Norn from a folder, wants to define a Project, create a Feature, frame an outcome, or resume an interrupted framing.",
    doNotUseWhen: "Do not start a legacy Pipeline or repository audit before the framing controller asks for technical confrontation.",
    triggers: "Use from any current directory. A Feature, workflow, Agent identity and prior session are not prerequisites. English triggers include frame, create a feature, resume the project and launch Norn. French triggers include cadrer, créer une feature, reprendre le projet and lancer Norn.",
    interface: {
      displayName: "Arka Norn framing",
      shortDescription: "Build and resume a live Project or Feature plan.",
      defaultPrompt: "Use $arka-norn to enter or resume the live framing plan from the current directory.",
    },
    allowedTools: ["Read", "Bash", "Grep", "Glob"],
    whenToUse: [
      "The user wants to frame or resume a Project or Feature.",
      "The current folder may be empty, skeletal, implemented or not initialized.",
    ],
    whenNotToUse: [
      "A verified delivery Pipeline already assigns another exact phase.",
      "The user only requests an unrelated read-only repository audit.",
    ],
    inputs: [
      { required: false, name: "path", description: "Folder to enter; defaults to the current directory." },
      { required: false, name: "feature", description: "Existing Feature id, only when the user explicitly refers to one." },
      { required: false, name: "new_feature_title", description: "Working outcome title; this does not create a Feature." },
    ],
    inputNotes: "The live plan is the memory. Never require or reconstruct an old chat session. Never ask for an id, directory or workflow that Norn can calculate.",
    references: [
      "`{{FRAMEWORK_DIR}}/schemas/framing-plan.schema.json` - live plan contract",
      "`{{FRAMEWORK_DIR}}/schemas/framing-delta.schema.json` - private broker delta contract",
      "`{{FRAMEWORK_DIR}}/docs/norn-framing-contract-proposal.md` - framing method and authority rules",
    ],
    procedure: [
      {
        title: "Enter and restate",
        content: "Run `arka-norn framing enter [path] --json`, adding `--feature <id>` or `--new-feature <working title>` only when the user's intent already distinguishes them. Restate what the current plan says and make every deduction visible and correctable.",
      },
      {
        title: "Advance the live plan",
        content: "While attention is `agent`, continue the conversation and submit only local `PlanDelta` operations through the private broker. Ask one open question only when continuing would invent human substance. Do not stop after a stored delta; report storage only after the returned revision confirms it.",
      },
      {
        title: "Respect the two stabilizations",
        content: "When attention becomes `human_stabilization`, explain what the stabilization authorizes and request it once. The first authorizes the repository probe and technical confrontation. The second binds the exact grounded revision, decomposition and selected delivery route. No document, worker or provider change adds another gate.",
      },
      {
        title: "Ground by repository nature",
        content: "For `empty`, design greenfield and never run an audit. For `skeleton`, read only manifests and constraints. For `implemented`, first read code structure and public surfaces without product intent, then confront the findings. A blind reader runs only through an explicitly selected enabled ExecutionProfile 2.3 after its exact preflight succeeds; never switch provider or model silently. If no isolated reader is available, return a recoverable failure or transport the expurgated resume packet instead of pretending the intent-aware Agent performed a blind read. For `indeterminate`, state reduced authority and recover observability. Source facts require snapshot plus file:line; absence claims require the inventory attestation.",
      },
      {
        title: "Resume and hand off",
        content: "Use `arka-norn framing resume [target] --json` whenever context changes. Transport the expurgated resume packet, never provider configuration or conversation verbatim. After the second stabilization, publish through the broker and follow the calculated delivery entry.",
      },
    ],
    outputFormat: "Keep the user's result, current understanding, visible deductions and immediate next move in view. Do not expose raw JSON or enum labels as primary prose. Report revision and fingerprint when a stabilization or publication depends on them.",
  };
}

function procedureFor(config) {
  if (config.name === "arka-product") return productProcedure();
  const nextCommand = config.mode === "guided"
    ? `arka-norn ${config.command} next <feature> --session <session-id> --json`
    : "arka-norn pipeline next <feature> --json";
  return [
    {
      title: "Resolve locale and verified context",
      content: "Run `arka-norn locale show --json`, `feature show`, `agent current` and `agent sessions`. Reply in the active display locale. Keep contract keys in English and set `content_locale` to the prose locale.",
    },
    {
      title: "Read one calculated action",
      content: `Run \`${nextCommand}\`. Use its stable codes, parameters, expected artifact and suggested command without guessing from display prose. Stop if the action is null.`,
    },
    {
      title: "Produce the bounded artifact",
      content: "Execute only the proposed scaffold command. Replace every sentinel, preserve the specialized session, satisfy code, functional, UX and security evidence where applicable, and never modify another documentary phase.",
    },
    {
      title: "Validate and stop",
      content: `Run \`arka-norn pipeline validate <feature> --document <file> --json\`, then rerun \`${nextCommand}\` only to observe the transition. Report the next action without executing it.`,
    },
  ];
}

function productProcedure() {
  return [
    {
      title: "Resolve locale, Project mode and verified context",
      content: "Run `arka-norn locale show --json`, `project show --json`, `feature show`, `agent current` and `agent sessions`. Reply in the active display locale, keep contract keys in English and set `content_locale` to the prose locale. Treat the Project orchestration mode returned by the CLI as authoritative.",
    },
    {
      title: "Read one calculated action",
      content: "Run `arka-norn pipeline next <feature> --json`. Use its stable codes, parameters, expected artifact and suggested command without guessing from display prose. Stop if the action is null.",
    },
    {
      title: "Follow the selected delivery mode",
      content: "Reload the versioned FrameworkContext before every mutation. Product control is always recoverable through the exact `agent prompt product` or `agent handoff-prompt` calculated by Norn; this is the bootstrap path for Product-owned framing steps and does not authorize a provider fallback for specialist work. In automatic mode, never generate a manual architect, audit, development or QA handoff: after a validated Feature Brief exists, dispatch only a human-confirmed task DAG through registered execution profiles. Use `orchestration profile`, `preview`, `start`, `status`, `apply` and `recovery`; never invoke, resume or retry a legacy 2.2 campaign, and never reinterpret a blocked action.",
    },
    {
      title: "Speak for the chosen human surface",
      content: "Answer in this order: completed, happening now, reason, decision only if required, and where to follow it in Norn Web. For preferredSurface=web, use functional language and hide prompts, private workspace paths, environment variables, fingerprints and CLI commands outside the explicit Product continuation action; that action may expose only the exact prepared context after the human chooses ChatGPT or Claude.ai. For tui, name cockpit actions and keep technical details collapsible. Show exact commands only for preferredSurface=cli or when the user explicitly asks for one.",
    },
    {
      title: "Validate and stop",
      content: "After the automatic mission or manual handoff completes, rerun `arka-norn pipeline next <feature> --json` only to observe the transition. Report the verified result without executing a second phase in the same invocation.",
    },
  ];
}

function compact(value) {
  return value.length <= 64 ? value : `${value.slice(0, 61).trimEnd()}...`;
}
