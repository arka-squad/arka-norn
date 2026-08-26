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
import { ProjectTrackingService } from "../../src/application/web/project-tracking-service.ts";
import { createAgentOrchestrationRuntime } from "../../src/composition/agent-orchestration-runtime.ts";
import { createDoctorRuntime } from "../../src/composition/doctor-runtime.ts";
import { createFramingRuntime } from "../../src/composition/framing-runtime.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";

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
  });

  const entered = await service.enterProjectFraming({ root: projectRoot });
  assert.equal(entered.lifecycle, "draft");
  assert.equal(entered.availability.markerReady, false);
  assert.equal(entered.availability.reason, "framing_publication_required");
  assert.equal(entered.framing?.framingId, "project");
  assert.equal(existsSync(resolve(projectRoot, ".arka-norn")), false);

  const listed = await service.listProjects();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.lifecycle, "draft");
  assert.equal(listed[0]?.featureCount, 0);
  assert.equal(listed[0]?.framing?.planId, entered.framing?.planId);
  await assert.rejects(service.createFeature(entered.id, { id: "forbidden", name: "Forbidden", root: resolve(projectRoot, "feature") }), /Project/u);
  assert.equal(existsSync(resolve(projectRoot, ".arka-norn")), false);
});
