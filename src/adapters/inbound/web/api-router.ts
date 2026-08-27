/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { ProjectTrackingService } from "../../../application/web/project-tracking-service.js";
import type { AgentMutationInput, LiveInvalidation, OrchestrationAuthorizationInput, OrchestrationBudgetLimitInput } from "../../../application/web/contracts.js";
import { WebMutationError } from "../../../application/web/web-mutation-concurrency.js";
import { AgentId } from "../../../domain/agent/agent-id.js";
import type { SseHub } from "./sse-hub.js";
import { logWebRequestError } from "./web-error-log.js";
import { resolveLocale, translate, type Locale } from "../../../application/localization/locale.js";

const MAX_BODY_BYTES = 64 * 1024;
type MutationInvalidation = Omit<LiveInvalidation, "revision" | "occurredAt">;
interface DispatchResult { readonly status: number; readonly value: unknown; readonly invalidations: readonly MutationInvalidation[] }

export async function routeApi(
  request: IncomingMessage,
  response: ServerResponse,
  service: ProjectTrackingService,
  hub: SseHub,
): Promise<void> {
  const locale = requestLocale(request);
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname.split("/").filter(Boolean).map(decodeSegment);
  if (segments[0] !== "api" || segments[1] !== "v1") return sendError(response, 404, "not_found", locale);
  if (request.method === "GET" && segments[2] === "events" && segments.length === 3) {
    hub.connect(response);
    return;
  }
  try {
    const data = await dispatch(request, segments.slice(2), url, service);
    sendJson(response, data.status, data.value, locale);
    for (const invalidation of data.invalidations) hub.publish(invalidation);
  } catch (error) {
    logWebRequestError(request, error);
    const clientError = error instanceof ClientRequestError || error instanceof WebMutationError;
    sendError(response, clientError ? error.status : 400, clientError ? error.code : "request_rejected", locale, error instanceof WebMutationError ? error.details : {});
  }
}

async function dispatch(
  request: IncomingMessage,
  segments: readonly string[],
  url: URL,
  service: ProjectTrackingService,
): Promise<DispatchResult> {
  const method = request.method ?? "GET";
  if (method === "GET" && same(segments, ["health"])) return ok({ status: "ready" });
  if (method === "GET" && same(segments, ["capabilities"])) return ok(service.getCapabilities());
  if (method === "GET") return dispatchGet(segments, url, service);
  if (method === "POST") return dispatchPost(request, segments, service);
  if (method === "PUT" && segments.length === 3 && segments[0] === "projects" && segments[2] === "orchestration-mode") {
    const input = await body<{ readonly mode?: unknown; readonly expectedUpdatedAt?: unknown }>(request, ["mode", "expectedUpdatedAt"]);
    if (input.mode !== "manual" && input.mode !== "automatic") throw new ClientRequestError(400, "invalid_orchestration_mode");
    if (typeof input.expectedUpdatedAt !== "string") throw new ClientRequestError(400, "invalid_expected_timestamp");
    const projectId = id(segments[1]);
    const project = await service.setProjectOrchestrationMode(projectId, { mode: input.mode, expectedUpdatedAt: input.expectedUpdatedAt });
    return ok(project, [{ scope: "project", projectId }, { scope: "orchestration", projectId }]);
  }
  if (method === "PUT" && same(segments, ["preferences"])) {
    return ok(await service.savePreferences(await body(request, ["locale", "name", "email", "preferredSurface", "onboarding"])));
  }
  throw new ClientRequestError(404, "not_found");
}

async function dispatchGet(segments: readonly string[], url: URL, service: ProjectTrackingService) {
  if (same(segments, ["projects"])) return ok(await service.listProjects());
  if (segments.length === 2 && segments[0] === "projects") return ok(await service.getProject(id(segments[1])));
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "framing") return ok(await service.listFramings(id(segments[1])));
  if (segments.length === 4 && segments[0] === "projects" && segments[2] === "framing") return ok(await service.getFraming(id(segments[1]), id(segments[3])));
  const feature = await dispatchFeatureGet(segments, service);
  if (feature !== undefined) return feature;
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "graph") {
    return ok(await service.getGraph(id(segments[1]), url.searchParams.get("featureId") ?? undefined));
  }
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "governance") return ok(await service.getGovernance(id(segments[1])));
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "agents") return ok(await service.getAgents(id(segments[1])));
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "audits") return ok(await service.getAudits(id(segments[1])));
  if (segments.length === 4 && segments[0] === "projects" && segments[2] === "audits") return ok(await service.getAudit(id(segments[1]), id(segments[3])));
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "orchestrations") return ok(await service.getOrchestrations(id(segments[1])));
  if (same(segments, ["preferences"])) return ok(await service.getPreferences());
  if (same(segments, ["doctor"])) return ok(await service.inspectDoctor());
  throw new ClientRequestError(404, "not_found");
}

async function dispatchFeatureGet(segments: readonly string[], service: ProjectTrackingService) {
  if (segments.length < 4 || segments[0] !== "projects" || segments[2] !== "features") return undefined;
  const projectId = id(segments[1]);
  const featureId = id(segments[3]);
  if (segments.length === 4) return ok(await service.getFeature(projectId, featureId));
  if (segments.length === 5 && segments[4] === "continuation") return ok(await service.getFeatureContinuation(projectId, featureId));
  if (segments.length === 6 && segments[4] === "documents") return ok(await service.getDocument(projectId, featureId, id(segments[5])));
  return undefined;
}

async function dispatchPost(request: IncomingMessage, segments: readonly string[], service: ProjectTrackingService) {
  if (same(segments, ["folder-picker"])) return ok(await service.pickFolder(await body(request, ["purpose", "defaultPath"])));
  if (same(segments, ["framing", "enter"])) {
    const input = await body<{ readonly root?: unknown }>(request, ["root"]);
    if (typeof input.root !== "string" || input.root.trim().length === 0 || input.root.length > 4_096) throw new ClientRequestError(400, "invalid_root");
    const project = await service.enterProjectFraming({ root: input.root.trim() });
    return created(project, [{ scope: "projects" }, { scope: "project", projectId: project.id }]);
  }
  if (same(segments, ["projects"])) {
    const project = await service.createProject(await body(request, ["id", "name", "root"]));
    return created(project, [{ scope: "projects" }, { scope: "project", projectId: project.id }]);
  }
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "features") {
    const projectId = id(segments[1]);
    const feature = await service.createFeature(projectId, await body(request, ["id", "name", "root", "pipelineId"]));
    return created(feature, [{ scope: "projects" }, { scope: "project", projectId }, { scope: "feature", projectId, featureId: feature.id }]);
  }
  const agent = await dispatchAgentPost(request, segments, service);
  if (agent !== undefined) return agent;
  const framing = await dispatchFramingPost(request, segments, service);
  if (framing !== undefined) return framing;
  const featurePost = await dispatchFeaturePost(request, segments, service);
  if (featurePost !== undefined) return featurePost;
  const orchestration = await dispatchOrchestrationPost(request, segments, service);
  if (orchestration !== undefined) return orchestration;
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "governance") {
    const projectId = id(segments[1]);
    const governance = await service.appendGovernance(projectId, await body(request, ["kind", "targets", "reason", "resolvesEventId", "supersedesEventId"]));
    return created(governance, [{ scope: "governance", projectId }, { scope: "project", projectId }]);
  }
  if (segments.length === 4 && segments[0] === "projects" && segments[2] === "audits" && segments[3] === "prepare") {
    const projectId = id(segments[1]);
    const audit = await service.prepareAudit(projectId, await body(request, ["featureId", "objective", "mode", "paths", "modules"]));
    return created(audit, [{ scope: "audits", projectId }, { scope: "project", projectId }]);
  }
  const audit = await dispatchAuditPost(request, segments, service);
  if (audit !== undefined) return audit;
  if (same(segments, ["doctor", "repair-preview"])) {
    await body(request, []);
    return ok(await service.previewDoctorRepairs());
  }
  if (same(segments, ["doctor", "repair-apply"])) {
    const input = await body<{ readonly fingerprint?: unknown; readonly confirmed?: unknown }>(request, ["fingerprint", "confirmed"]);
    if (typeof input.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(input.fingerprint)) throw new ClientRequestError(400, "invalid_doctor_fingerprint");
    if (typeof input.confirmed !== "boolean") throw new ClientRequestError(400, "invalid_doctor_confirmation");
    const outcome = await service.applyDoctorRepairs({ fingerprint: input.fingerprint, confirmed: input.confirmed });
    return ok(outcome, [{ scope: "projects" }, { scope: "project" }, { scope: "feature" }, { scope: "agents" }]);
  }
  throw new ClientRequestError(404, "not_found");
}

async function dispatchAgentPost(request: IncomingMessage, segments: readonly string[], service: ProjectTrackingService): Promise<DispatchResult | undefined> {
  return dispatchAgentPostImpl(request, segments, service);
}

async function dispatchFeaturePost(request: IncomingMessage, segments: readonly string[], service: ProjectTrackingService): Promise<DispatchResult | undefined> {
  if (segments.length !== 5 || segments[0] !== "projects" || segments[2] !== "features") return undefined;
  if (segments[4] === "product-prompt") {
    return ok(await service.prepareProductPrompt(id(segments[1]), id(segments[3]), await body(request, ["target", "purpose"])));
  }
  if (segments[4] === "orchestration-preview") {
    await body(request, []);
    return ok(await service.previewOrchestration(id(segments[1]), id(segments[3])));
  }
  return undefined;
}

async function dispatchOrchestrationPost(request: IncomingMessage, segments: readonly string[], service: ProjectTrackingService): Promise<DispatchResult | undefined> {
  if (segments.length !== 3 || segments[0] !== "projects") return undefined;
  const projectId = id(segments[1]);
  if (segments[2] === "orchestration-authorize") {
    const input = await body<Record<string, unknown>>(request, ["previewFingerprint", "riskPolicyFingerprint", "actor", "profileByRole", "allowCommits", "applyMode", "automaticRiskThreshold", "maxParallel", "budgetMode", "budgetLimits", "openBarProfiles"]);
    const run = await service.authorizeOrchestration(projectId, orchestrationAuthorizationInput(input));
    return ok(run, [{ scope: "projects" }, { scope: "project", projectId }, { scope: "orchestration", projectId }]);
  }
  if (segments[2] === "orchestration-apply") {
    const input = await body<{ readonly campaignId?: unknown; readonly confirmationFingerprint?: unknown }>(request, ["campaignId", "confirmationFingerprint"]);
    if (typeof input.campaignId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,119}$/u.test(input.campaignId)) throw new ClientRequestError(400, "invalid_campaign_id");
    if (typeof input.confirmationFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(input.confirmationFingerprint)) throw new ClientRequestError(400, "invalid_confirmation_fingerprint");
    const run = await service.applyOrchestration(projectId, { campaignId: input.campaignId, confirmationFingerprint: input.confirmationFingerprint });
    return ok(run, [{ scope: "projects" }, { scope: "project", projectId }, { scope: "orchestration", projectId }]);
  }
  return undefined;
}

function orchestrationAuthorizationInput(input: Record<string, unknown>): OrchestrationAuthorizationInput {
  if (typeof input.previewFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(input.previewFingerprint)) throw new ClientRequestError(400, "invalid_preview_fingerprint");
  if (typeof input.riskPolicyFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(input.riskPolicyFingerprint)) throw new ClientRequestError(400, "invalid_risk_policy_fingerprint");
  if (typeof input.actor !== "string" || input.actor.trim().length === 0 || input.actor.length > 200) throw new ClientRequestError(400, "invalid_actor");
  if (typeof input.allowCommits !== "boolean") throw new ClientRequestError(400, "invalid_allow_commits");
  if (input.applyMode !== "human" && input.applyMode !== "automatic") throw new ClientRequestError(400, "invalid_apply_mode");
  if (input.budgetMode !== "admission" && input.budgetMode !== "hard-stop" && input.budgetMode !== "observe") throw new ClientRequestError(400, "invalid_budget_mode");
  if (!Number.isInteger(input.automaticRiskThreshold) || (input.automaticRiskThreshold as number) < 0 || (input.automaticRiskThreshold as number) > 20) throw new ClientRequestError(400, "invalid_risk_threshold");
  return {
    previewFingerprint: input.previewFingerprint,
    riskPolicyFingerprint: input.riskPolicyFingerprint,
    actor: input.actor.trim(),
    profileByRole: roleProfileMap(input.profileByRole),
    allowCommits: input.allowCommits,
    applyMode: input.applyMode,
    automaticRiskThreshold: input.automaticRiskThreshold as number,
    maxParallel: parallelismInput(input.maxParallel),
    budgetMode: input.budgetMode,
    budgetLimits: budgetLimitsInput(input.budgetLimits),
    openBarProfiles: stringArrayInput(input.openBarProfiles, "invalid_open_bar"),
  };
}

function roleProfileMap(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ClientRequestError(400, "invalid_profile_by_role");
  const output: Record<string, string> = {};
  for (const [role, profile] of Object.entries(value)) {
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(role) || typeof profile !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(profile)) throw new ClientRequestError(400, "invalid_profile_by_role");
    output[role] = profile;
  }
  if (Object.keys(output).length === 0) throw new ClientRequestError(400, "invalid_profile_by_role");
  return output;
}

function parallelismInput(value: unknown): number | "all" {
  if (value === "all") return "all";
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 32) throw new ClientRequestError(400, "invalid_max_parallel");
  return value as number;
}

function budgetLimitsInput(value: unknown): readonly OrchestrationBudgetLimitInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ClientRequestError(400, "invalid_budget_limits");
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new ClientRequestError(400, "invalid_budget_limits");
    const limit = entry as Record<string, unknown>;
    if (typeof limit.profileId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(limit.profileId)) throw new ClientRequestError(400, "invalid_budget_limits");
    if (limit.metric !== "cli_quota_percent" && limit.metric !== "currency_eur" && limit.metric !== "calls" && limit.metric !== "duration_seconds") throw new ClientRequestError(400, "invalid_budget_limits");
    if (typeof limit.maximum !== "number" || !Number.isFinite(limit.maximum) || limit.maximum <= 0) throw new ClientRequestError(400, "invalid_budget_limits");
    return { profileId: limit.profileId, metric: limit.metric, maximum: limit.maximum };
  });
}

function stringArrayInput(value: unknown, code: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ClientRequestError(400, code);
  return value.map((entry) => {
    if (typeof entry !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(entry)) throw new ClientRequestError(400, code);
    return entry;
  });
}

async function dispatchAgentPostImpl(request: IncomingMessage, segments: readonly string[], service: ProjectTrackingService): Promise<DispatchResult | undefined> {
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "agents") {
    const projectId = id(segments[1]);
    const agents = await service.registerAgent(projectId, await agentMutationBody(request));
    return created(agents, [{ scope: "agents", projectId }, { scope: "project", projectId }]);
  }
  if (segments.length === 5 && segments[0] === "projects" && segments[2] === "agents") {
    const projectId = id(segments[1]);
    const agentId = webAgentId(segments[3]);
    const action = segments[4];
    if (action === "replace") return ok(await service.replaceAgent(projectId, agentId, await agentMutationBody(request)), [{ scope: "agents", projectId }, { scope: "project", projectId }]);
    if (action === "select") {
      const input = await body<{ readonly sessionId?: unknown; readonly expectedRegistryRevision?: unknown }>(request, ["sessionId", "expectedRegistryRevision"]);
      return ok(await service.selectAgent(projectId, agentId, sessionRevisionInput(input)), [{ scope: "agents", projectId }, { scope: "project", projectId }]);
    }
    if (action === "deactivate") {
      const input = await body<{ readonly expectedRegistryRevision?: unknown; readonly confirmation?: unknown }>(request, ["expectedRegistryRevision", "confirmation"]);
      if (typeof input.confirmation !== "string" || input.confirmation.length > 128) throw new ClientRequestError(400, "invalid_agent_confirmation");
      return ok(await service.deactivateAgent(projectId, agentId, { expectedRegistryRevision: revision(input.expectedRegistryRevision), confirmation: input.confirmation }), [{ scope: "agents", projectId }, { scope: "project", projectId }]);
    }
  }
  return undefined;
}

async function dispatchFramingPost(request: IncomingMessage, segments: readonly string[], service: ProjectTrackingService) {
  if (segments.length !== 3 || segments[0] !== "projects" || segments[2] !== "framing") return undefined;
  const input = await body<{ readonly existingFeatureId?: unknown; readonly newFeatureTitle?: unknown }>(request, ["existingFeatureId", "newFeatureTitle"]);
  if (input.existingFeatureId !== undefined && typeof input.existingFeatureId !== "string") throw new ClientRequestError(400, "invalid_feature");
  if (input.newFeatureTitle !== undefined && (typeof input.newFeatureTitle !== "string" || input.newFeatureTitle.trim().length === 0 || input.newFeatureTitle.length > 256)) throw new ClientRequestError(400, "invalid_title");
  const projectId = id(segments[1]);
  return created(await service.startFraming(projectId, {
    ...(typeof input.existingFeatureId === "string" ? { existingFeatureId: id(input.existingFeatureId) } : {}),
    ...(typeof input.newFeatureTitle === "string" ? { newFeatureTitle: input.newFeatureTitle.trim() } : {}),
  }), [{ scope: "project", projectId }]);
}

async function agentMutationBody(request: IncomingMessage): Promise<AgentMutationInput> {
  const input = await body<{ readonly provider?: unknown; readonly role?: unknown; readonly sessionId?: unknown; readonly scope?: unknown; readonly expectedRegistryRevision?: unknown }>(request, ["provider", "role", "sessionId", "scope", "expectedRegistryRevision"]);
  if (typeof input.provider !== "string" || typeof input.role !== "string") throw new ClientRequestError(400, "invalid_agent_identity");
  const session = sessionRevisionInput(input);
  return {
    provider: input.provider,
    role: input.role,
    sessionId: session.sessionId,
    expectedRegistryRevision: session.expectedRegistryRevision,
    ...(input.scope === undefined ? {} : { scope: agentScope(input.scope) }),
  };
}

function sessionRevisionInput(input: { readonly sessionId?: unknown; readonly expectedRegistryRevision?: unknown }): { readonly sessionId: string; readonly expectedRegistryRevision: number } {
  if (typeof input.sessionId !== "string" || input.sessionId.length > 64) throw new ClientRequestError(400, "invalid_agent_session");
  return { sessionId: input.sessionId, expectedRegistryRevision: revision(input.expectedRegistryRevision) };
}

function agentScope(value: unknown): NonNullable<AgentMutationInput["scope"]> {
  if (!isRecord(value) || Object.keys(value).some((key) => !["featureIds", "paths", "responsibilities"].includes(key))) throw new ClientRequestError(400, "invalid_agent_scope");
  const arrays = [value["featureIds"], value["paths"], value["responsibilities"]];
  if (arrays.some((entries) => entries !== undefined && (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")))) throw new ClientRequestError(400, "invalid_agent_scope");
  return {
    ...(value["featureIds"] === undefined ? {} : { featureIds: value["featureIds"] as readonly string[] }),
    ...(value["paths"] === undefined ? {} : { paths: value["paths"] as readonly string[] }),
    ...(value["responsibilities"] === undefined ? {} : { responsibilities: value["responsibilities"] as readonly string[] }),
  };
}

function revision(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new ClientRequestError(400, "invalid_expected_revision");
  return Number(value);
}

async function dispatchAuditPost(request: IncomingMessage, segments: readonly string[], service: ProjectTrackingService) {
  if (segments.length !== 5 || segments[0] !== "projects" || segments[2] !== "audits") return undefined;
  const projectId = id(segments[1]);
  const auditId = id(segments[3]);
  const action = segments[4];
  if (action === "start") {
    const input = await body<{ readonly confirmation?: unknown }>(request, ["confirmation"]);
    if (typeof input.confirmation !== "string") throw new ClientRequestError(400, "confirmation_required");
    return ok(await service.startAudit(projectId, auditId, input.confirmation), [{ scope: "audits", projectId }, { scope: "project", projectId }]);
  }
  if (action === "finalize" || action === "cancel" || action === "resume") {
    await body(request, []);
    const audit = action === "finalize"
      ? await service.finalizeAudit(projectId, auditId)
      : action === "cancel" ? await service.cancelAudit(projectId, auditId) : await service.resumeAudit(projectId, auditId);
    return ok(audit, [{ scope: "audits", projectId }, { scope: "project", projectId }]);
  }
  return undefined;
}

export function sendJson(response: ServerResponse, status: number, data: unknown, locale: Locale = "en"): void {
  const payload = JSON.stringify({
    schemaVersion: 2,
    ok: status >= 200 && status < 300,
    data,
    errors: [],
    warnings: [],
    display: { locale, message: "" },
  });
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  response.end(payload);
}

export function sendError(
  response: ServerResponse,
  status: number,
  code: string,
  locale: Locale = "en",
  params: Readonly<Record<string, unknown>> = {},
): void {
  const payload = JSON.stringify({
    schemaVersion: 2,
    ok: false,
    data: null,
    errors: [{ code, params }],
    warnings: [],
    display: { locale, message: translate(errorMessageKey(status, code), {}, locale) },
  });
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  response.end(payload);
}

function errorMessageKey(status: number, code: string): "web.error.unauthorized" | "web.error.generic" | "web.error.projectChanged" | "web.error.projectDraftNotMaterialized" | "web.error.automaticPreflightRequired" | "web.error.agentRegistryChanged" | "web.error.agentConfirmationRequired" | "web.error.repairPlanChanged" {
  if (status === 401) return "web.error.unauthorized";
  if (code === "project_changed") return "web.error.projectChanged";
  if (code === "project_draft_not_materialized") return "web.error.projectDraftNotMaterialized";
  if (code === "automatic_preflight_required") return "web.error.automaticPreflightRequired";
  if (code === "agent_registry_changed") return "web.error.agentRegistryChanged";
  if (code === "agent_confirmation_required") return "web.error.agentConfirmationRequired";
  if (code === "repair_plan_changed") return "web.error.repairPlanChanged";
  return "web.error.generic";
}

function requestLocale(request: IncomingMessage): Locale {
  const header = request.headers["accept-language"];
  return resolveLocale({ environment: {}, ...(typeof header === "string" ? { systemLocale: header } : {}) });
}

async function body<T>(request: IncomingMessage, allowedKeys: readonly string[]): Promise<T> {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("application/json")) {
    throw new ClientRequestError(415, "unsupported_media_type");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<unknown>) {
    const value = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(String(chunk));
    size += value.length;
    if (size > MAX_BODY_BYTES) throw new ClientRequestError(413, "body_too_large");
    chunks.push(value);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!isRecord(value)) throw new Error("object required");
    const unexpected = Object.keys(value).find((key) => !allowedKeys.includes(key));
    if (unexpected !== undefined) throw new ClientRequestError(400, "unexpected_field");
    return value as T;
  } catch (error) {
    if (error instanceof ClientRequestError) throw error;
    throw new ClientRequestError(400, "invalid_json");
  }
}

function id(value: string | undefined): string {
  if (value === undefined || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) throw new ClientRequestError(400, "invalid_id");
  return value;
}

function webAgentId(value: string | undefined): string {
  if (value === undefined || !AgentId.isValid(value)) throw new ClientRequestError(400, "invalid_agent_id");
  return value;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ClientRequestError(400, "invalid_path");
  }
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function ok(value: unknown, invalidations: readonly MutationInvalidation[] = []): DispatchResult { return { status: 200, value, invalidations }; }
function created(value: unknown, invalidations: readonly MutationInvalidation[] = []): DispatchResult { return { status: 201, value, invalidations }; }

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class ClientRequestError extends Error {
  public constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}
