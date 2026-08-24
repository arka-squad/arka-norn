/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import axe from "axe-core";

import type { RunningWebServer } from "../../src/adapters/inbound/web/web-server.js";

let sandbox = "";
let projectRoot = "";
let server: RunningWebServer | undefined;

test.beforeAll(async () => {
  sandbox = await mkdtemp(resolve(tmpdir(), "arka-norn-web-e2e-"));
  projectRoot = resolve(sandbox, "project");
  await mkdir(projectRoot, { recursive: true });
  const { AgentSessionId } = await import("../../src/domain/agent/agent-session-id.ts");
  const { createWebRuntime } = await import("../../src/composition/web-runtime.ts");
  server = await createWebRuntime({
    frameworkRoot: resolve(import.meta.dirname, "..", ".."),
    homeDir: resolve(sandbox, "home"),
    cwd: projectRoot,
    sessionId: AgentSessionId.MAIN,
    environment: { LANG: "en_US.UTF-8" },
    token: "e2e-fixed-session-token-0123456789",
    folderPicker: { pick: async () => projectRoot },
  });
});

test.afterAll(async () => {
  await server?.close();
  await rm(sandbox, { recursive: true, force: true });
});

test("local API rejects unauthorized origins and exposes no orchestration control", async () => {
  const runtime = requiredServer();
  const session = new URL(runtime.url);
  session.hash = "";
  const origin = session.origin;
  const unauthorized = await fetch(`${origin}/api/v1/projects`);
  expect(unauthorized.status).toBe(401);
  const foreign = await fetch(`${origin}/api/v1/projects`, { headers: { Authorization: `Bearer ${runtime.token}`, Origin: "http://attacker.invalid" } });
  expect(foreign.status).toBe(401);
  const authorized = await fetch(`${origin}/api/v1/projects`, { headers: { "Accept-Language": "fr-FR", Authorization: `Bearer ${runtime.token}`, Origin: origin } });
  expect(authorized.status).toBe(200);
  const envelope = await authorized.json() as { readonly schemaVersion: number; readonly display: { readonly locale: string } };
  expect(envelope.schemaVersion).toBe(2);
  expect(envelope.display.locale).toBe("fr");
  expect(JSON.stringify(envelope)).not.toContain(runtime.token);
  const control = await fetch(`${origin}/api/v1/projects/demo/orchestrations/start`, { method: "POST", headers: { Authorization: `Bearer ${runtime.token}`, Origin: origin } });
  expect(control.status).toBe(404);
  const shell = await fetch(origin);
  expect(shell.headers.get("content-security-policy")).toContain("default-src 'self'");
});

test("Project manager creates a profile, Project and Essential Feature in EN and FR", async ({ page }) => {
  await page.goto(requiredServer().url);
  const brand = await page.locator(".wordmark-mark").evaluate((element) => ({
    loaded: (element as HTMLImageElement).naturalWidth > 0,
    red: getComputedStyle(document.documentElement).getPropertyValue("--arka-red").trim(),
    theme: document.documentElement.dataset.theme,
    typography: getComputedStyle(document.body).fontFamily,
  }));
  expect(brand).toEqual({ loaded: true, red: "#c70f43", theme: "dark", typography: expect.stringContaining("Poppins") });
  await expect(page.getByRole("dialog", { name: "Identify the human decision maker" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Norn QA");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Create Project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "Create Project" });
  const projectName = projectDialog.getByRole("textbox", { name: /^Name/ });
  await expect(projectName).toBeFocused();
  await projectName.fill("Demo Project");
  await projectDialog.getByRole("button", { name: "Choose folder" }).click();
  await expect(projectDialog.getByText(projectRoot)).toBeVisible();
  await projectDialog.getByRole("button", { name: "Register Project" }).click();
  await expect(page.getByRole("heading", { name: "Demo Project" })).toBeVisible();

  await page.getByRole("button", { name: "Features", exact: true }).click();
  await page.getByRole("button", { name: "Create Feature" }).click();
  const featureDialog = page.getByRole("dialog", { name: "Create Feature" });
  await featureDialog.getByRole("textbox", { name: /^Name/ }).fill("Customer export");
  await featureDialog.getByRole("button", { name: "Add Feature" }).click();
  await expect(page.getByRole("heading", { name: "Customer export" })).toBeVisible();
  await expect(page.getByText("essential", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "FR" }).click();
  await expect(page.getByRole("button", { name: "Vue d'ensemble" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  for (const width of [1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await page.addScriptTag({ content: axe.source });
  const seriousViolations = await page.evaluate(async () => {
    const engine = (window as unknown as { readonly axe: { run(): Promise<{ readonly violations: readonly { readonly impact: string | null; readonly id: string; readonly nodes: readonly { readonly target: readonly string[] }[] }[] }> } }).axe;
    const results = await engine.run();
    return results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(" ")) }));
  });
  expect(seriousViolations).toEqual([]);
});

function requiredServer(): RunningWebServer {
  if (server === undefined) throw new Error("Web test server did not start.");
  return server;
}
