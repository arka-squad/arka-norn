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
  skill("arka-norn", "Arka Norn bootstrap", "Initialize the Product Agent and verified Project context.", "core.bootstrap", core, "2.1.0"),
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
  catalogVersion: "2.1.0",
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

function definitionFor(config) {
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
      content: "Reload the versioned FrameworkContext before every mutation. In automatic mode, never call `agent prompt`, display a copy/paste prompt, prepare a manual handoff, or ask the user to open another Claude Code or Codex session. Norn 2.3 dispatches only a human-confirmed task DAG through registered execution profiles. Use `orchestration profile`, `preview`, `start`, `status`, `apply` and `recovery`; never invoke, resume or retry a legacy 2.2 campaign, and never reinterpret a blocked action. In manual mode only, use the exact prompt and handoff commands calculated by the CLI.",
    },
    {
      title: "Speak for the chosen human surface",
      content: "Answer in this order: completed, happening now, reason, decision only if required, and where to follow it in Norn Web. For preferredSurface=web, use functional language and never show internal prompts, private workspace paths, environment variables, fingerprints or CLI commands. For tui, name cockpit actions and keep technical details collapsible. Show exact commands only for preferredSurface=cli or when the user explicitly asks for one.",
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
