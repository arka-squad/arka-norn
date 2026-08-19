import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import type { InputSource, KeyEvent, KeyListener } from "../../src/adapters/inbound/tui/runtime/input.ts";
import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { createContainer } from "../../src/composition/container.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { readEnv } from "../../src/composition/env.ts";

test("la composition TUI pilote Home → Project → Feature → scaffold réel", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-navigation-"));
  const projectRoot = resolve(sandbox, "project");
  const featureRoot = resolve(projectRoot, "feature");
  mkdirSync(featureRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: sandbox });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot });
  await management.features.create({ id: FeatureId.of("feature"), projectId: project.id, name: "Feature", root: featureRoot });
  const author = await management.agents.register({ project, provider: "Codex", role: "dev", featureIds: [FeatureId.of("feature")] });

  const input = controlledInput();
  const renderer = createRenderer({ write: () => true, isTTY: false });
  const env = readEnv({ ARKA_NORN_HOME: sandbox }, projectRoot);
  const container = createContainer(env, {
    input: input.source,
    renderer,
    theme: createTheme({}, false),
    viewport: () => ({ columns: 120, rows: 50 }),
  });
  const home = await container.createHomeView();
  container.app.push(home);
  const running = container.app.run({ registerProcessHandlers: false });

  input.send({ kind: "down" });
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== home, "ouverture Project");
  const projectScene = container.app.topScene();
  assert.ok(projectScene);

  input.send({ kind: "down" });
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== projectScene, "ouverture Feature");
  const featureScene = container.app.topScene();
  assert.ok(featureScene);

  input.send({ kind: "down" });
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== featureScene, "menu scaffold");
  const stepMenu = container.app.topScene();
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== stepMenu, "saisie scaffold");
  const inputScene = container.app.topScene();
  input.send({ kind: "enter" });
  const conceptPath = resolve(featureRoot, "concept.json");
  await waitUntil(() => existsSync(conceptPath), "écriture scaffold");
  await waitUntil(() => container.app.topScene() !== inputScene && container.app.topScene() !== featureScene, "résultat scaffold");

  const document = JSON.parse(readFileSync(conceptPath, "utf8")) as { readonly type: string; readonly feature_id: string; readonly author_agent_id: string };
  assert.equal(document.type, "concept");
  assert.equal(document.feature_id, "feature");
  assert.equal(document.author_agent_id, author.id.value);

  input.send({ kind: "interrupt" });
  await running;
});

function controlledInput(): { readonly source: InputSource; readonly send: (event: KeyEvent) => void } {
  const listeners = new Set<KeyListener>();
  return {
    source: {
      start() {},
      stop() {},
      on(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    send(event) {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
  throw new Error(`Timeout TUI : ${label}`);
}
