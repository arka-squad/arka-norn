/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { createHash } from "node:crypto";

import {
  isAssessmentStatus,
  isAuditDepth,
  isAuditMode,
  isAuditModuleId,
  isConfidenceLevel,
  isFindingOrigin,
  isFindingSeverity,
  isModuleExecutionStatus,
  type AuditFinding,
  type AuditModuleResult,
  type AuditRequest,
} from "../../domain/audit/audit-types.js";
import { auditModuleDefinition } from "../../domain/audit/module-catalog.js";

const SECRET_PATTERN = /(?:api[_ -]?key|access[_ -]?token|token|auth(?:orization)?|password|secret)\s*[:=]|\bBearer\s+[a-z0-9._-]{12,}\b|\bsk-[a-z0-9_-]{12,}\b|\bAKIA[0-9A-Z]{16}\b/i;

export function parseAuditRequest(value: unknown): AuditRequest {
  if (!isRecord(value)) throw new Error("Audit request must be an object");
  if (!isAuditMode(value["mode"])) throw new Error("Audit request mode must be discovery, audit or mixed");
  const objective = printable(value["objective"], "objective", 2_000);
  const paths = stringArray(value["paths"], "paths", true).map(normalizeRelativePath);
  if (!Array.isArray(value["modules"]) || value["modules"].length === 0) throw new Error("Audit request modules must not be empty");
  const modules = value["modules"].map((candidate, index) => {
    if (!isRecord(candidate) || !isAuditModuleId(candidate["moduleId"]) || candidate["moduleId"] === "M00") {
      throw new Error(`Audit module ${index} is invalid or reserved`);
    }
    if (candidate["intent"] !== "discover" && candidate["intent"] !== "audit") throw new Error(`Audit module ${candidate["moduleId"]} intent is invalid`);
    if (!isAuditDepth(candidate["depth"])) throw new Error(`Audit module ${candidate["moduleId"]} depth is invalid`);
    const intent: "discover" | "audit" = candidate["intent"];
    if (depthRank(candidate["depth"]) > depthRank(auditModuleDefinition(candidate["moduleId"]).maximumDepth)) throw new Error(`Audit module ${candidate["moduleId"]} does not support depth ${candidate["depth"]}`);
    return {
      moduleId: candidate["moduleId"],
      intent,
      depth: candidate["depth"],
      criteria: stringArray(candidate["criteria"], `modules.${candidate["moduleId"]}.criteria`, false),
    };
  });
  if (new Set(modules.map((item) => item.moduleId)).size !== modules.length) throw new Error("Audit request modules must be unique");
  if (value["mode"] === "discovery" && modules.some((item) => item.intent !== "discover")) throw new Error("Discovery mode only accepts discover module intents");
  if (value["mode"] === "audit" && modules.some((item) => item.intent !== "audit")) throw new Error("Audit mode only accepts audit module intents");
  if (value["mode"] === "mixed" && (!modules.some((item) => item.intent === "discover") || !modules.some((item) => item.intent === "audit"))) throw new Error("Mixed mode requires discover and audit module intents");
  const sources = record(value["sources"], "sources");
  const capabilities = record(value["capabilities"], "capabilities");
  const sourcePaths = stringArray(sources["paths"], "sources.paths", false).map(normalizeRelativePath);
  const urls = stringArray(sources["urls"], "sources.urls", false).map(validateSourceUrl);
  const allowedHosts = stringArray(capabilities["allowedHosts"], "capabilities.allowedHosts", false).map(validateHost);
  const credentialRefs = stringArray(capabilities["credentialRefs"], "capabilities.credentialRefs", false);
  if (!credentialRefs.every((item) => /^[A-Z][A-Z0-9_]{0,63}$/.test(item))) throw new Error("Credential references must be environment variable names");
  const dynamicTargets = stringArray(capabilities["dynamicTargets"], "capabilities.dynamicTargets", false).map(validateDynamicTargetUrl);
  if (typeof capabilities["allowImagePulls"] !== "boolean") throw new Error("capabilities.allowImagePulls must be boolean");
  const referencedHosts = [...urls, ...dynamicTargets].map((url) => new URL(url).hostname.toLowerCase());
  if (referencedHosts.some((host) => !allowedHosts.includes(host))) throw new Error("Every source or target URL host must be explicitly allowed");
  const request: AuditRequest = {
    objective,
    mode: value["mode"],
    paths: unique(paths),
    modules,
    sources: { paths: unique(sourcePaths), urls: unique(urls) },
    capabilities: {
      allowImagePulls: capabilities["allowImagePulls"],
      allowedHosts: unique(allowedHosts),
      credentialRefs: unique(credentialRefs),
      dynamicTargets: unique(dynamicTargets),
    },
  };
  assertNoSecretMaterial(request);
  return request;
}

function depthRank(depth: AuditRequest["modules"][number]["depth"]): number {
  return ["inventory", "static", "connected", "dynamic"].indexOf(depth);
}

export function parseModuleResult(value: unknown, expectedAuditId: string, expectedModuleId: string): AuditModuleResult {
  if (!isRecord(value) || value["schemaVersion"] !== 1 || value["auditId"] !== expectedAuditId || value["moduleId"] !== expectedModuleId || !isAuditModuleId(value["moduleId"])) {
    throw new Error("Audit module result identity is invalid");
  }
  if ((value["intent"] !== "discover" && value["intent"] !== "audit") || !isAuditDepth(value["depth"])) throw new Error("Audit module result intent or depth is invalid");
  const execution = record(value["execution"], "execution");
  if (!isModuleExecutionStatus(execution["status"])) throw new Error("Audit module execution status is invalid");
  const tools = array(execution["tools"], "execution.tools").map((tool, index) => {
    const entry = record(tool, `execution.tools.${index}`);
    return { name: printable(entry["name"], "tool.name", 128), version: nullableString(entry["version"]), dataVersion: nullableString(entry["dataVersion"]) };
  });
  const assessmentValue = value["assessment"];
  let assessment: AuditModuleResult["assessment"] = null;
  if (assessmentValue !== null) {
    const entry = record(assessmentValue, "assessment");
    if (!isAssessmentStatus(entry["status"]) || !isConfidenceLevel(entry["confidence"])) throw new Error("Audit module assessment is invalid");
    assessment = { status: entry["status"], confidence: entry["confidence"] };
  }
  if (value["intent"] === "discover" && assessment !== null) throw new Error("Discovery module assessment must be null");
  if (value["intent"] === "audit" && assessment === null) throw new Error("Audit module assessment is required");
  const coverageValue = record(value["coverage"], "coverage");
  const coverage = {
    requested: stringArray(coverageValue["requested"], "coverage.requested", false),
    completed: stringArray(coverageValue["completed"], "coverage.completed", false),
    missing: stringArray(coverageValue["missing"], "coverage.missing", false),
  };
  if (assessment?.status === "pass" && (execution["status"] !== "complete" || coverage.missing.length > 0)) throw new Error("A pass assessment requires complete execution and coverage");
  const evidence = array(value["evidence"], "evidence").map((candidate, index) => parseEvidence(candidate, index));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const findings = array(value["findings"], "findings").map((candidate, index) => parseFinding(candidate, index, evidenceIds));
  if (assessment?.status === "pass" && findings.some((finding) => finding.severity === "critical")) throw new Error("A critical finding forbids a pass assessment");
  const result: AuditModuleResult = {
    schemaVersion: 1,
    auditId: expectedAuditId,
    moduleId: value["moduleId"],
    intent: value["intent"],
    depth: value["depth"],
    execution: {
      status: execution["status"],
      startedAt: isoDate(execution["startedAt"], "execution.startedAt"),
      endedAt: isoDate(execution["endedAt"], "execution.endedAt"),
      tools,
    },
    assessment,
    coverage,
    summary: printable(value["summary"], "summary", 8_000),
    strengths: stringArray(value["strengths"], "strengths", false),
    findings,
    evidence,
    limitations: stringArray(value["limitations"], "limitations", false),
    recommendations: stringArray(value["recommendations"], "recommendations", false),
    decisionsRequired: stringArray(value["decisionsRequired"], "decisionsRequired", false),
  };
  assertNoSecretMaterial(result);
  return result;
}

export function findingFingerprint(input: Pick<AuditFinding, "ruleId" | "scope" | "location">): string {
  return createHash("sha256").update(JSON.stringify([input.ruleId, input.scope, input.location])).digest("hex");
}

export function assertNoSecretMaterial(value: unknown): void {
  if (SECRET_PATTERN.test(JSON.stringify(value))) throw new Error("Audit payload contains credential-like material");
}

function parseEvidence(value: unknown, index: number): AuditModuleResult["evidence"][number] {
  const entry = record(value, `evidence.${index}`);
  if (entry["kind"] !== "command" && entry["kind"] !== "file" && entry["kind"] !== "metric" && entry["kind"] !== "external") throw new Error("Audit evidence kind is invalid");
  if (entry["classification"] !== "public" && entry["classification"] !== "internal" && entry["classification"] !== "sensitive") throw new Error("Audit evidence classification is invalid");
  if (typeof entry["redacted"] !== "boolean") throw new Error("Audit evidence redacted must be boolean");
  return {
    id: identifier(entry["id"], "evidence.id"), kind: entry["kind"], summary: printable(entry["summary"], "evidence.summary", 4_000),
    source: printable(entry["source"], "evidence.source", 512), location: nullableString(entry["location"]),
    observedAt: isoDate(entry["observedAt"], "evidence.observedAt"), producer: printable(entry["producer"], "evidence.producer", 256),
    toolVersion: nullableString(entry["toolVersion"]), dataVersion: nullableString(entry["dataVersion"]),
    contentHash: hash(entry["contentHash"], "evidence.contentHash"), classification: entry["classification"], redacted: entry["redacted"],
  };
}

function parseFinding(value: unknown, index: number, evidenceIds: ReadonlySet<string>): AuditFinding {
  const entry = record(value, `findings.${index}`);
  if (!isFindingSeverity(entry["severity"]) || !isConfidenceLevel(entry["confidence"]) || !isFindingOrigin(entry["origin"])) throw new Error("Audit finding classification is invalid");
  if (entry["status"] !== "open" && entry["status"] !== "accepted" && entry["status"] !== "resolved") throw new Error("Audit finding status is invalid");
  const finding: AuditFinding = {
    id: identifier(entry["id"], "finding.id"), ruleId: identifier(entry["ruleId"], "finding.ruleId"),
    title: printable(entry["title"], "finding.title", 512), description: printable(entry["description"], "finding.description", 8_000),
    severity: entry["severity"], confidence: entry["confidence"], origin: entry["origin"], status: entry["status"],
    evidenceIds: stringArray(entry["evidenceIds"], "finding.evidenceIds", true), scope: printable(entry["scope"], "finding.scope", 512),
    location: nullableString(entry["location"]), recommendation: nullableString(entry["recommendation"]),
    fingerprint: hash(entry["fingerprint"], "finding.fingerprint"),
  };
  if (finding.evidenceIds.some((id) => !evidenceIds.has(id))) throw new Error(`Finding ${finding.id} references unknown evidence`);
  if (finding.origin === "inferred" && finding.evidenceIds.length === 0) throw new Error(`Inferred finding ${finding.id} requires evidence`);
  if (finding.fingerprint !== findingFingerprint(finding)) throw new Error(`Finding ${finding.id} fingerprint is invalid`);
  return finding;
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "") || ".";
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) throw new Error(`Path is outside the Project: ${value}`);
  return normalized;
}

function validateHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  if (url.username !== "" || url.password !== "") throw new Error("URLs must not contain credentials");
  if (url.search !== "" || url.hash !== "") throw new Error("Audit URLs must not contain query parameters or fragments");
  return url.toString();
}

function validateSourceUrl(value: string): string {
  const normalized = validateHttpUrl(value);
  const host = new URL(normalized).hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal" || isPrivateIpv4Literal(host) || host === "::1") {
    throw new Error("Audit source URLs must not target localhost, private or metadata addresses");
  }
  return normalized;
}

function validateDynamicTargetUrl(value: string): string {
  const normalized = validateHttpUrl(value);
  const host = new URL(normalized).hostname.toLowerCase();
  if (host === "metadata.google.internal" || (isPrivateIpv4Literal(host) && !host.startsWith("127."))) throw new Error("Dynamic target must be public or explicit localhost");
  return normalized;
}

function isPrivateIpv4Literal(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127) || parts[0]! >= 224;
}

function validateHost(value: string): string {
  const host = value.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith(".") || host.endsWith(".")) throw new Error(`Invalid allowed host: ${value}`);
  return host;
}

function printable(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${field} is invalid`);
  return value;
}

function identifier(value: unknown, field: string): string {
  const result = printable(value, field, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) throw new Error(`${field} is invalid`);
  return result;
}

function hash(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field} must be a sha256 hash`);
  return value;
}

function isoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be an ISO date`);
  return new Date(value).toISOString();
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return printable(value, "nullable string", 2_000);
}

function stringArray(value: unknown, field: string, nonEmpty: boolean): string[] {
  const values = array(value, field).map((item, index) => printable(item, `${field}.${index}`, 2_000));
  if (nonEmpty && values.length === 0) throw new Error(`${field} must not be empty`);
  return unique(values);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error(`${field} must be an array`);
  return value;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
