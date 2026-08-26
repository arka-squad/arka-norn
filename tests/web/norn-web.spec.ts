/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
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

test("Project manager enters framing without the legacy wizard or a workflow choice in EN and FR", async ({ page }) => {
  await page.goto(requiredServer().url);
  const brand = await page.locator(".wordmark img").evaluate((element) => ({
    loaded: (element as HTMLImageElement).naturalWidth > 0,
    red: getComputedStyle(document.documentElement).getPropertyValue("--arka-red").trim(),
    theme: document.documentElement.dataset.theme,
    typography: getComputedStyle(document.body).fontFamily,
  }));
  expect(brand).toEqual({ loaded: true, red: "#c70f43", theme: "dark", typography: expect.stringContaining("Poppins") });
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Set up your verified workspace" })).toHaveCount(0);
  await page.getByRole("button", { name: "Create Project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "Create Project" });
  const projectName = projectDialog.getByRole("textbox", { name: /^Name/ });
  await projectName.fill("Demo Project");
  await projectDialog.getByRole("button", { name: "Choose folder" }).click();
  await expect(projectDialog.getByText(projectRoot)).toBeVisible();
  await projectDialog.getByRole("button", { name: "Register Project" }).click();

  await expect(page.getByRole("heading", { name: "Demo Project" })).toBeVisible();
  await page.locator(".sidebar").getByRole("button", { name: /^Features/ }).click();
  await page.getByRole("button", { name: "Frame a new Feature" }).click();
  const framingDialog = page.getByRole("dialog", { name: "Frame a new Feature" });
  await expect(framingDialog.getByText("The Feature, id, folder and workflow are calculated only after the plan is grounded.")).toBeVisible();
  await expect(framingDialog.getByText("Essential", { exact: true })).toHaveCount(0);
  await framingDialog.getByLabel("What should change for the user?").fill("Customer export");
  await framingDialog.getByRole("button", { name: "Start framing" }).click();
  await expect(page.getByRole("heading", { name: "Customer export" })).toBeVisible();
  await expect(page.getByText("The plan is being opened")).toBeVisible();
  expect(await registeredFeatureCount(page)).toBe(0);
  await expect(page.getByText("Automatic missions start", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy resume context" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", "https://github.com/arka-squad/arka-norn");
  await expect(page.getByRole("link", { name: "Star arka-norn on GitHub" })).toBeVisible();

  await page.getByRole("button", { name: "FR" }).click();
  await expect(page.getByRole("button", { name: "Vue d'ensemble" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNavigation = page.locator(".mobile-navigation");
  await expect(mobileNavigation.getByRole("button", { name: "Vue d'ensemble" })).toBeVisible();
  await expect(mobileNavigation.getByRole("button", { name: "Features" })).toBeVisible();
  await expect(mobileNavigation.getByRole("button", { name: "Documents" })).toBeVisible();
  const moreTrigger = mobileNavigation.getByRole("button", { name: "Plus" });
  await moreTrigger.click();
  const more = page.getByRole("dialog", { name: "Plus" });
  await expect(more.getByRole("button", { name: "Décisions" })).toBeVisible();
  await expect(more.getByRole("button", { name: "Audits" })).toBeVisible();
  await expect(more.getByRole("button", { name: "Réglages" })).toBeVisible();
  const touchTargets = await mobileNavigation.locator("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(touchTargets.every((height) => height >= 44)).toBe(true);
  await expect(more.getByRole("button", { name: "Fermer" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toBeHidden();
  await expect(moreTrigger).toBeFocused();

  await mobileNavigation.getByRole("button", { name: "Features" }).click();
  await expect(page.getByText("Aucune Feature n'est encore suivie.")).toBeVisible();
  await expect(page.locator(".feature-index")).toHaveCount(0);
  await expect(page.locator(".data-table")).toHaveCount(0);
  await expect(page.locator(".feature-index-state")).toBeHidden();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  await moreTrigger.click();
  await more.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("button", { name: "Inspecter avec Doctor" }).click();
  await expect(page.locator(".doctor-report")).toBeVisible();
  await expect(page.locator("pre.doctor-output")).toHaveCount(0);

  for (const width of [390, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  }
  await page.addScriptTag({ content: axe.source });
  const seriousViolations = await page.evaluate(async () => {
    const engine = (window as unknown as { readonly axe: { run(): Promise<{ readonly violations: readonly { readonly impact: string | null; readonly id: string; readonly nodes: readonly { readonly target: readonly string[] }[] }[] }> } }).axe;
    const results = await engine.run();
    return results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(" ")) }));
  });
  expect(seriousViolations).toEqual([]);
});

async function registeredFeatureCount(page: Page): Promise<number | undefined> {
  return page.evaluate(async () => {
    const token = sessionStorage.getItem("arka-norn-web-token");
    const response = await fetch("/api/v1/projects", { headers: { Authorization: `Bearer ${token ?? ""}` } });
    const envelope = await response.json() as { readonly data?: readonly { readonly featureCount?: number }[] };
    return envelope.data?.[0]?.featureCount;
  });
}

function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function requiredServer(): RunningWebServer {
  if (server === undefined) throw new Error("Web test server did not start.");
  return server;
}
