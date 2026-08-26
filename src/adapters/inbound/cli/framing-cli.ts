/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { resolve } from "node:path";

import { activeLocale, translate, type MessageKey } from "../../../application/localization/locale.js";
import { createFramingRuntime } from "../../../composition/framing-runtime.js";
import type { FramingPlan, PlanDelta } from "../../../domain/framing/framing-plan.js";
import type { FramingView } from "../../../ports/inbound/for-framing.js";
import { readJson } from "../../outbound/filesystem/_shared/atomic-json.js";

import { jsonEnvelope } from "./cli-envelope.js";
import type { CliExecution } from "./cli-execution.js";
import { CliUsageError, parseStrictArguments, type StrictArgumentSpec } from "./strict-arguments.js";

export interface FramingCliContext {
  readonly homeDir: string;
  readonly cwd: string;
  readonly frameworkRoot?: string;
}

export async function runFramingCommand(argv: readonly string[], context: FramingCliContext): Promise<CliExecution> {
  const action = argv[0];
  const json = argv.includes("--json");
  const command = `framing.${action ?? "unknown"}`;
  try {
    if (action === undefined) throw new CliUsageError("missing framing action");
    const runtime = createFramingRuntime({ homeDir: context.homeDir, ...(context.frameworkRoot === undefined ? {} : { frameworkRoot: context.frameworkRoot }) });
    const parsed = parseStrictArguments(argv.slice(1), specification(action));
    const result = await execute(action, runtime, parsed, context);
    return success(command, result.data, result.message, json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliUsageError ? 64 : 70;
    if (!json) return { code, stdout: "", stderr: `Error: ${message}\n` };
    return { code, stdout: jsonEnvelope({ command, ok: false, data: null, errors: [message], errorCode: code === 64 ? "invalid_arguments" : "framing_error" }), stderr: "" };
  }
}

type Runtime = ReturnType<typeof createFramingRuntime>;
type Parsed = ReturnType<typeof parseStrictArguments>;

async function execute(action: string, runtime: Runtime, parsed: Parsed, context: FramingCliContext): Promise<{ data: unknown; message: string }> {
  if (action === "enter") return enter(runtime, parsed, context);
  if (action === "show") return show(runtime, parsed, context);
  if (action === "resume") return resume(runtime, parsed, context);
  if (action === "_broker") return broker(runtime, parsed, context);
  if (action === "list") return list(runtime, parsed, context);
  throw new CliUsageError(`unknown framing action: ${action}`);
}

async function enter(runtime: Runtime, args: Parsed, context: FramingCliContext) {
  const path = resolve(context.cwd, args.positionals[0] ?? context.cwd);
  const entry = await runtime.enter({
    path,
    ...(args.values.get("feature") === undefined ? {} : { existingFeatureId: args.values.get("feature")! }),
    ...(args.values.get("new-feature") === undefined ? {} : { newFeatureTitle: args.values.get("new-feature")! }),
    contentLocale: activeLocale(),
  });
  const projection = runtime.project(entry.plan, "summary");
  return {
    data: { project: serializeProject(entry.project), resumed: entry.resumed, framing: projection },
    message: `${translate(entry.resumed ? "framing.cli.resumed" : "framing.cli.opened")} — ${humanMessage(entry.plan)}`,
  };
}

async function show(runtime: Runtime, args: Parsed, context: FramingCliContext) {
  const projectId = await resolveProjectId(runtime, args, context);
  const view = framingView(args.values.get("view"));
  const plan = await runtime.show(projectId, args.positionals[0]);
  return { data: runtime.project(plan, view), message: renderPlan(plan, view) };
}

async function resume(runtime: Runtime, args: Parsed, context: FramingCliContext) {
  const projectId = await resolveProjectId(runtime, args, context);
  const packet = await runtime.resume(projectId, args.positionals[0]);
  const plan = await runtime.show(projectId, args.positionals[0]);
  return { data: packet, message: `${localizedSummary(plan)}\n${translate("framing.cli.resumeProof", { fingerprint: packet.fingerprint, action: localizedAction(plan) }, plan.contentLocale)}` };
}

async function list(runtime: Runtime, args: Parsed, context: FramingCliContext) {
  const projectId = await resolveProjectId(runtime, args, context);
  const values = await runtime.list(projectId);
  return { data: values, message: values.length === 0 ? translate("framing.cli.none") : values.map((item) => translate("framing.cli.list", {
    id: item.framingId, revision: item.revision, status: translate(item.published ? "framing.cli.status.published" : "framing.cli.status.active"),
  })).join("\n") };
}

async function broker(runtime: Runtime, args: Parsed, context: FramingCliContext) {
  const operation = args.positionals[0];
  const framingId = args.positionals[1];
  if (operation === undefined || framingId === undefined) throw new CliUsageError("framing _broker requires an operation and framing id");
  const projectId = await resolveProjectId(runtime, args, context);
  let plan: FramingPlan;
  if (operation === "apply") {
    const deltaPath = required(args, "delta");
    const delta = await readJson<PlanDelta>(resolve(context.cwd, deltaPath));
    if (delta === undefined) throw new Error(`Plan delta not found: ${deltaPath}.`);
    plan = await runtime.applyDelta(projectId, framingId, delta);
  } else if (operation === "stabilize") {
    const kind = required(args, "kind");
    if (kind !== "intent" && kind !== "grounded_plan") throw new CliUsageError("--kind must be intent or grounded_plan");
    plan = await runtime.stabilize({
      projectId, framingId, kind, actorId: required(args, "actor"), fingerprint: required(args, "fingerprint"),
    });
  } else if (operation === "publish") {
    plan = await runtime.publish(projectId, framingId);
  } else {
    throw new CliUsageError(`unknown framing broker operation: ${operation}`);
  }
  return { data: runtime.project(plan, "summary"), message: translate("framing.cli.saved", { revision: plan.revision, action: localizedAction(plan) }, plan.contentLocale) };
}

async function resolveProjectId(runtime: Runtime, args: Parsed, context: FramingCliContext): Promise<string> {
  const explicit = args.values.get("project");
  if (explicit !== undefined) return explicit;
  return (await runtime.locateProject(context.cwd, false)).id.value;
}

function specification(action: string): StrictArgumentSpec {
  const common = { json: "boolean" as const, project: "string" as const };
  if (action === "enter") return {
    options: { json: "boolean", feature: "string", "new-feature": "string" },
    minPositionals: 0, maxPositionals: 1, exclusiveGroups: [["feature", "new-feature"]],
  };
  if (action === "show") return { options: { ...common, view: "string" }, minPositionals: 0, maxPositionals: 1 };
  if (action === "resume" || action === "list") return { options: common, minPositionals: 0, maxPositionals: action === "list" ? 0 : 1 };
  if (action === "_broker") return {
    options: { ...common, delta: "string", kind: "string", actor: "string", fingerprint: "string" },
    minPositionals: 2, maxPositionals: 2,
  };
  return { options: { json: "boolean" } };
}

function framingView(value: string | undefined): FramingView {
  if (value === undefined) return "summary";
  if (value === "summary" || value === "plan" || value === "evidence" || value === "map") return value;
  throw new CliUsageError("--view must be summary, plan, evidence or map");
}

function required(args: Parsed, name: string): string {
  const value = args.values.get(name);
  if (value === undefined) throw new CliUsageError(`--${name} is required`);
  return value;
}

function success(command: string, data: unknown, message: string, json: boolean): CliExecution {
  if (json) return { code: 0, stdout: jsonEnvelope({ command, ok: true, data, message }), stderr: "" };
  return { code: 0, stdout: `${message}\n`, stderr: "" };
}

function serializeProject(project: Awaited<ReturnType<Runtime["locateProject"]>>) {
  return { id: project.id.value, name: project.name, root: project.root, orchestrationMode: project.orchestrationMode };
}

function humanMessage(plan: FramingPlan): string {
  return translate("framing.cli.context", { target: plan.target.kind === "project" ? "Project" : plan.target.workingTitle, nature: repositoryLabel(plan), action: localizedAction(plan) }, plan.contentLocale);
}

function renderPlan(plan: FramingPlan, view: FramingView): string {
  const locale = plan.contentLocale;
  const target = plan.target.kind === "project" ? `Project ${plan.target.projectId}` : plan.target.workingTitle;
  const header = translate("framing.cli.header", { target, revision: plan.revision }, locale);
  if (view === "summary") return `${header}\n${translate("framing.cli.summary", { nature: repositoryLabel(plan), authority: plan.derivedState.planAuthority, action: localizedAction(plan) }, locale)}`;
  if (view === "evidence") return `${header}\n${translate("framing.cli.evidence", { files: plan.repositoryProbe.inventory.files, sources: plan.repositoryProbe.inventory.sourceFiles, tests: plan.repositoryProbe.inventory.testFiles, evidence: plan.knowledge["evidence.claims"].filter((item) => item.status === "active").length }, locale)}`;
  const decomposition = decompositionLabel(plan);
  if (view === "map") return `${header}\n${translate("framing.cli.map", { decomposition, action: localizedAction(plan) }, locale)}`;
  const established = Object.values(plan.knowledge).flat().filter((item) => item.status === "active");
  return `${header}\n${translate("framing.cli.plan", { established: established.length, decomposition, action: localizedAction(plan) }, locale)}`;
}

function repositoryLabel(plan: FramingPlan): string {
  return translate(`framing.repository.${plan.repositoryProbe.nature}` as MessageKey, {}, plan.contentLocale);
}

function localizedAction(plan: FramingPlan): string {
  return translate(`framing.action.${plan.derivedState.nextAction.kind}` as MessageKey, {}, plan.contentLocale);
}

function decompositionLabel(plan: FramingPlan): string {
  if (plan.decomposition === null) return translate("framing.cli.decomposition.none", {}, plan.contentLocale);
  return plan.decomposition.kind === "project_features"
    ? translate("framing.cli.decomposition.features", { count: plan.decomposition.features.length }, plan.contentLocale)
    : translate("framing.cli.decomposition.lots", { count: plan.decomposition.lots.length }, plan.contentLocale);
}

function localizedSummary(plan: FramingPlan): string {
  const active = Object.values(plan.knowledge).flat().filter((item) => item.status === "active");
  return translate("framing.summary.full", {
    title: plan.target.kind === "project" ? `Project ${plan.target.projectId}` : plan.target.workingTitle,
    effect: plan.knowledge["intent.desired_effects"].find((item) => item.status === "active")?.statement ?? translate("framing.summary.effectMissing", {}, plan.contentLocale),
    last: active.sort((left, right) => right.introducedInRevision - left.introducedInRevision)[0]?.statement ?? translate("framing.summary.lastMissing", {}, plan.contentLocale),
    next: localizedAction(plan),
  }, plan.contentLocale);
}
