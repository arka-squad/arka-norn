/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { ProjectTrackingService } from "../../../application/web/project-tracking-service.js";
import type { SseHub } from "./sse-hub.js";
import { resolveLocale, translate, type Locale } from "../../../application/localization/locale.js";

const MAX_BODY_BYTES = 64 * 1024;

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
  } catch (error) {
    const clientError = error instanceof ClientRequestError;
    sendError(response, clientError ? error.status : 400, clientError ? error.code : "request_rejected", locale);
  }
}

async function dispatch(
  request: IncomingMessage,
  segments: readonly string[],
  url: URL,
  service: ProjectTrackingService,
): Promise<{ readonly status: number; readonly value: unknown }> {
  const method = request.method ?? "GET";
  if (method === "GET") return dispatchGet(segments, url, service);
  if (method === "POST") return dispatchPost(request, segments, service);
  if (method === "PUT" && same(segments, ["preferences"])) return ok(await service.savePreferences(await body(request)));
  throw new ClientRequestError(404, "not_found");
}

async function dispatchGet(segments: readonly string[], url: URL, service: ProjectTrackingService) {
  if (same(segments, ["projects"])) return ok(await service.listProjects());
  if (segments.length === 2 && segments[0] === "projects") return ok(await service.getProject(id(segments[1])));
  if (segments.length === 4 && segments[0] === "projects" && segments[2] === "features") return ok(await service.getFeature(id(segments[1]), id(segments[3])));
  if (segments.length === 6 && segments[0] === "projects" && segments[2] === "features" && segments[4] === "documents") return ok(await service.getDocument(id(segments[1]), id(segments[3]), id(segments[5])));
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

async function dispatchPost(request: IncomingMessage, segments: readonly string[], service: ProjectTrackingService) {
  if (same(segments, ["projects"])) return created(await service.createProject(await body(request)));
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "features") {
    return created(await service.createFeature(id(segments[1]), await body(request)));
  }
  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "governance") return created(await service.appendGovernance(id(segments[1]), await body(request)));
  if (segments.length === 4 && segments[0] === "projects" && segments[2] === "audits" && segments[3] === "prepare") {
    return created(await service.prepareAudit(id(segments[1]), await body(request)));
  }
  if (segments.length === 5 && segments[0] === "projects" && segments[2] === "audits") {
    const projectId = id(segments[1]);
    const auditId = id(segments[3]);
    const action = segments[4];
    if (action === "start") {
      const input = await body<{ readonly confirmation?: unknown }>(request);
      if (typeof input.confirmation !== "string") throw new ClientRequestError(400, "confirmation_required");
      return ok(await service.startAudit(projectId, auditId, input.confirmation));
    }
    if (action === "finalize") return ok(await service.finalizeAudit(projectId, auditId));
    if (action === "cancel") return ok(await service.cancelAudit(projectId, auditId));
    if (action === "resume") return ok(await service.resumeAudit(projectId, auditId));
  }
  if (same(segments, ["doctor", "repair"])) return ok(await service.repairDoctor(await body(request)));
  throw new ClientRequestError(404, "not_found");
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

export function sendError(response: ServerResponse, status: number, code: string, locale: Locale = "en"): void {
  const payload = JSON.stringify({
    schemaVersion: 2,
    ok: false,
    data: null,
    errors: [{ code, params: {} }],
    warnings: [],
    display: { locale, message: translate(status === 401 ? "web.error.unauthorized" : "web.error.generic", {}, locale) },
  });
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  response.end(payload);
}

function requestLocale(request: IncomingMessage): Locale {
  const header = request.headers["accept-language"];
  return resolveLocale({ environment: {}, ...(typeof header === "string" ? { systemLocale: header } : {}) });
}

async function body<T>(request: IncomingMessage): Promise<T> {
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
    return value as T;
  } catch {
    throw new ClientRequestError(400, "invalid_json");
  }
}

function id(value: string | undefined): string {
  if (value === undefined || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) throw new ClientRequestError(400, "invalid_id");
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

function ok(value: unknown) { return { status: 200, value } as const; }
function created(value: unknown) { return { status: 201, value } as const; }

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class ClientRequestError extends Error {
  public constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}
