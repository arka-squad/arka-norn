/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";

import { compareAudits } from "../../src/application/audit/audit-report.js";
import { findingFingerprint, parseAuditRequest, parseModuleResult } from "../../src/application/audit/audit-validation.js";
import { AUDIT_MODULE_CATALOG, expandAuditModuleDependencies } from "../../src/domain/audit/module-catalog.js";
import type { AuditCanonical, AuditFinding, AuditModuleResult } from "../../src/domain/audit/audit-types.js";
import { AUDIT_TOOL_CATALOG } from "../../src/domain/audit/tool-catalog.js";
import { ContainerAuditToolRunner } from "../../src/adapters/outbound/audit/container-audit-tool-runner.js";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("le catalogue d'audit expose douze domaines et développe leurs dépendances", () => {
  assert.equal(AUDIT_MODULE_CATALOG.length, 12);
  assert.deepEqual(expandAuditModuleDependencies(["M05"]), ["M00", "M04", "M05"]);
  assert.ok(AUDIT_TOOL_CATALOG.every((tool) => /@sha256:[a-f0-9]{64}$/.test(tool.image)));
  assert.ok(AUDIT_TOOL_CATALOG.every((tool) => !tool.image.includes(":latest")));
});

test("les cinq schémas d'audit compilent ensemble en JSON Schema 2020-12", () => {
  const ajv = new Ajv2020({ strict: true });
  ajv.addFormat("date-time", { type: "string", validate: (value: string) => !Number.isNaN(Date.parse(value)) });
  ajv.addFormat("uri", { type: "string", validate: (value: string) => { try { new URL(value); return true; } catch { return false; } } });
  for (const name of ["audit-request", "audit-run", "audit-module-result", "audit-canonical", "audit-kb-record"] as const) {
    ajv.addSchema(JSON.parse(readFileSync(resolve(ROOT, "schemas", `${name}.schema.json`), "utf8")) as AnySchema);
  }
  for (const name of ["audit-request", "audit-run", "audit-module-result", "audit-canonical", "audit-kb-record"] as const) assert.ok(ajv.getSchema(`${name}.schema.json`), name);
});

test("audit-request distingue mode, profondeur, allowlist et références de credentials", () => {
  const request = parseAuditRequest({
    objective: "Découvrir le produit et auditer la CI",
    mode: "mixed",
    paths: ["."],
    modules: [
      { moduleId: "M06", intent: "audit", depth: "connected", criteria: ["permissions minimales"] },
      { moduleId: "M09", intent: "discover", depth: "static", criteria: [] },
    ],
    sources: { paths: [], urls: ["https://api.github.com/repos/arka-squad/arka-norn"] },
    capabilities: { allowImagePulls: false, allowedHosts: ["api.github.com"], credentialRefs: ["GITHUB_TOKEN"], dynamicTargets: [] },
  });
  assert.equal(request.mode, "mixed");
  assert.deepEqual(request.capabilities.credentialRefs, ["GITHUB_TOKEN"]);
  assert.throws(() => parseAuditRequest({ ...request, mode: "discovery" }), /only accepts discover/);
  assert.throws(() => parseAuditRequest({ ...request, sources: { paths: [], urls: ["http:\/\/127.0.0.1/metadata"] }, capabilities: { ...request.capabilities, allowedHosts: ["127.0.0.1"] } }), /localhost, private or metadata/);
});

test("le runner refuse les arguments de contrôle de conteneur avant tout processus", async () => {
  const runner = new ContainerAuditToolRunner("docker");
  await assert.rejects(runner.run({ toolId: "syft", projectRoot: ".", arguments: ["--privileged"], allowPull: false, allowNetwork: false, writableWorkspace: false, timeoutMs: 5_000 }), /forbidden/);
});

test("un pass incomplet, une inférence sans preuve et un secret sont refusés", () => {
  const finding = makeFinding();
  const base = moduleResult(finding);
  assert.throws(() => parseModuleResult({ ...base, assessment: { status: "pass", confidence: "high" } }, "audit-20260823t120000z-1234abcd", "M05"), /complete execution and coverage/);
  assert.throws(() => parseModuleResult({ ...base, findings: [{ ...finding, origin: "inferred", evidenceIds: [] }] }, "audit-20260823t120000z-1234abcd", "M05"), /must not be empty|requires evidence/);
  assert.throws(() => parseModuleResult({ ...base, summary: "api_key=abcdefghijklmnop" }, "audit-20260823t120000z-1234abcd", "M05"), /credential-like/);
});

test("compare classe nouveaux, persistants, résolus, régressions et couverture", () => {
  const persistent = makeFinding();
  const resolved = { ...makeFinding("rule-resolved"), severity: "low" as const };
  const added = makeFinding("rule-new");
  const baseline = canonical("audit-20260822t120000z-1234abcd", [persistent, resolved], "complete");
  const current = canonical("audit-20260823t120000z-1234abcd", [{ ...persistent, severity: "critical" }, added], "partial");
  const result = compareAudits(baseline, current);
  assert.deepEqual(result.new, [added.fingerprint]);
  assert.deepEqual(result.resolved, [resolved.fingerprint]);
  assert.deepEqual(result.regressed, [persistent.fingerprint]);
  assert.equal(result.coverageChanged, true);
});

function moduleResult(finding: AuditFinding): AuditModuleResult {
  const observedAt = "2026-08-23T12:00:00.000Z";
  return {
    schemaVersion: 1,
    auditId: "audit-20260823t120000z-1234abcd",
    moduleId: "M05",
    intent: "audit",
    depth: "static",
    execution: { status: "partial", startedAt: observedAt, endedAt: observedAt, tools: [] },
    assessment: { status: "warn", confidence: "medium" },
    coverage: { requested: ["secrets", "dependencies"], completed: ["secrets"], missing: ["dependencies"] },
    summary: "Couverture partielle.",
    strengths: [],
    findings: [finding],
    evidence: [{ id: "EV-M05-0001", kind: "file", summary: "Configuration observée.", source: "project", location: "SECURITY.md", observedAt, producer: "test", toolVersion: null, dataVersion: null, contentHash: createHash("sha256").update("evidence").digest("hex"), classification: "internal", redacted: false }],
    limitations: ["Scanner absent."],
    recommendations: [],
    decisionsRequired: [],
  };
}

function makeFinding(ruleId = "rule-main"): AuditFinding {
  const input = { ruleId, scope: ".", location: "src/main.ts" };
  return {
    id: `F-${ruleId}`,
    ruleId,
    title: "Contrôle à traiter",
    description: "Un écart explicite est observé.",
    severity: "medium",
    confidence: "high",
    origin: "observed",
    status: "open",
    evidenceIds: ["EV-M05-0001"],
    scope: input.scope,
    location: input.location,
    recommendation: "Corriger après l'audit.",
    fingerprint: findingFingerprint(input),
  };
}

function canonical(auditId: string, findings: readonly AuditFinding[], executionStatus: "complete" | "partial"): AuditCanonical {
  const result = { ...moduleResult(findings[0] ?? makeFinding()), execution: { ...moduleResult(makeFinding()).execution, status: executionStatus }, findings };
  return {
    schemaVersion: 1,
    auditId,
    projectId: "project",
    commitExact: "a".repeat(40),
    mode: "audit",
    status: executionStatus === "complete" ? "completed" : "partial",
    generatedAt: "2026-08-23T12:00:00.000Z",
    coverage: { complete: executionStatus === "complete" ? 1 : 0, partial: executionStatus === "partial" ? 1 : 0, skipped: 0, total: 1 },
    moduleResults: [result],
    findings,
    strengths: [],
    limitations: [],
    recommendations: [],
    decisionsRequired: [],
  };
}
