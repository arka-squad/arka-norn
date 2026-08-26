/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { FsGovernanceStore } from "../../src/adapters/outbound/filesystem/fs-governance-store.ts";
import { FsLocalePreferenceStore } from "../../src/adapters/outbound/filesystem/fs-locale-preference-store.ts";
import { FsOrchestrationConfigurationStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-configuration-store.ts";
import { ProjectTrackingService } from "../../src/application/web/project-tracking-service.ts";
import { createAgentOrchestrationRuntime } from "../../src/composition/agent-orchestration-runtime.ts";
import { createDoctorRuntime } from "../../src/composition/doctor-runtime.ts";
import { createFramingRuntime } from "../../src/composition/framing-runtime.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { ExecutionProfile } from "../../src/domain/orchestration/execution-profile.ts";
import { OrchestrationConfiguration } from "../../src/domain/orchestration/orchestration-configuration.ts";
import { WebMutationError } from "../../src/application/web/web-mutation-concurrency.ts";

const FRAMEWORK_ROOT = resolve(import.meta.dirname, "..", "..");

test("le Web projette un ProjectDraft et borne ses capacités au cadrage", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "norn-web-project-draft-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const management = createManagementRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT, sessionId: AgentSessionId.MAIN });
  const pipeline = createPipelineRuntime(FRAMEWORK_ROOT, { homeDir: home });
  const framing = createFramingRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT });
  const service = new ProjectTrackingService({
    management,
    pipeline,
    framing,
    agentOrchestration: createAgentOrchestrationRuntime({ ...management, pipeline, preferredSurface: () => Promise.resolve("web"), allowEmptyAuthorRegistry: true }),
    governance: new FsGovernanceStore(),
    preferences: new FsLocalePreferenceStore(home),
    doctor: createDoctorRuntime(home, projectRoot),
    folderPicker: { pick: async () => projectRoot },
    homeDir: home,
    orchestrationConfigurations: new FsOrchestrationConfigurationStore(),
  });

  const entered = await service.enterProjectFraming({ root: projectRoot });
  assert.equal(entered.lifecycle, "draft");
  assert.equal(Number.isNaN(Date.parse(entered.updatedAt)), false);
  assert.equal(entered.availability.markerReady, false);
  assert.equal(entered.availability.reason, "framing_publication_required");
  assert.equal(entered.framing?.framingId, "project");
  assert.equal(existsSync(resolve(projectRoot, ".arka-norn")), false);

  const capabilities = service.getCapabilities();
  assert.equal(capabilities.capabilities.length, 15);
  assert.equal(capabilities.capabilities.find((item) => item.id === "project.set_orchestration_mode")?.surfaces.includes("web"), true);

  const listed = await service.listProjects();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.lifecycle, "draft");
  assert.equal(listed[0]?.featureCount, 0);
  assert.equal(listed[0]?.framing?.planId, entered.framing?.planId);
  await assert.rejects(
    service.setProjectOrchestrationMode(entered.id, { mode: "automatic", expectedUpdatedAt: entered.updatedAt }),
    (error: unknown) => error instanceof WebMutationError && error.status === 409 && error.code === "project_draft_not_materialized",
  );
  await assert.rejects(service.createFeature(entered.id, { id: "forbidden", name: "Forbidden", root: resolve(projectRoot, "feature") }), /Project/u);
  assert.equal(existsSync(resolve(projectRoot, ".arka-norn")), false);
});

test("le Web change le mode avec prérequis, concurrence optimiste et sans démarrage implicite", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "norn-web-project-mode-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  let tick = Date.parse("2026-08-27T08:00:00.000Z");
  const clock = { now: () => new Date(tick += 1_000) };
  const management = createManagementRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT, sessionId: AgentSessionId.MAIN, clock });
  const pipeline = createPipelineRuntime(FRAMEWORK_ROOT, { homeDir: home });
  const framing = createFramingRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT });
  const configurations = new FsOrchestrationConfigurationStore();
  const service = new ProjectTrackingService({
    management,
    pipeline,
    framing,
    agentOrchestration: createAgentOrchestrationRuntime({ ...management, pipeline, preferredSurface: () => Promise.resolve("web"), allowEmptyAuthorRegistry: true }),
    governance: new FsGovernanceStore(),
    preferences: new FsLocalePreferenceStore(home),
    doctor: createDoctorRuntime(home, projectRoot),
    folderPicker: { pick: async () => projectRoot },
    homeDir: home,
    orchestrationConfigurations: configurations,
    now: clock.now,
  });
  const created = await service.createProject({ id: "product", name: "Product", root: projectRoot });
  assert.equal(created.orchestration.preflight.readyForPreview, false);
  await assert.rejects(
    service.setProjectOrchestrationMode("product", { mode: "automatic", expectedUpdatedAt: created.updatedAt }),
    (error: unknown) => error instanceof WebMutationError && error.status === 422 && error.code === "automatic_preflight_required",
  );

  const project = await management.projects.show((await management.projects.list())[0]!.id);
  const at = clock.now();
  const profile = ExecutionProfile.create({
    schemaVersion: 1, id: "codex-product", transport: "codex-cli", provider: "OpenAI", model: "gpt-5.5",
    capabilities: ["inspect_workspace"], egressHosts: [], costMeter: { kind: "unknown", observable: false }, enabled: true, createdAt: at, updatedAt: at,
  });
  await configurations.save(project, OrchestrationConfiguration.empty(project.id.value, at).register(profile, at));
  const ready = await service.getProject("product");
  assert.deepEqual(ready.orchestration.preflight, { readyForPreview: true, configurationPresent: true, configuredProfiles: 1, enabledProfiles: 1, missing: [] });

  const automatic = await service.setProjectOrchestrationMode("product", { mode: "automatic", expectedUpdatedAt: ready.updatedAt });
  assert.equal(automatic.orchestrationMode, "automatic");
  assert.equal((await configurations.load(project))?.automaticEnabled, true);
  assert.equal((await service.getOrchestrations("product")).length, 0);
  await assert.rejects(
    service.setProjectOrchestrationMode("product", { mode: "manual", expectedUpdatedAt: ready.updatedAt }),
    (error: unknown) => error instanceof WebMutationError && error.status === 409 && error.code === "project_changed",
  );
  const manual = await service.setProjectOrchestrationMode("product", { mode: "manual", expectedUpdatedAt: automatic.updatedAt });
  assert.equal(manual.orchestrationMode, "manual");
  assert.equal((await configurations.load(project))?.automaticEnabled, false);
});
