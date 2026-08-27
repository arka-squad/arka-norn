/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { access, chmod, mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import axe from "axe-core";

import type { LiveInvalidation } from "../../src/application/web/contracts.js";
import type { RunningWebServer } from "../../src/adapters/inbound/web/web-server.js";

let sandbox = "";
let projectRoot = "";
let materializedRoot = "";
let server: RunningWebServer | undefined;

test.beforeAll(async () => {
  sandbox = await mkdtemp(resolve(tmpdir(), "arka-norn-web-e2e-"));
  projectRoot = resolve(sandbox, "project");
  materializedRoot = resolve(sandbox, "materialized-project");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(materializedRoot, { recursive: true });
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
  const capabilities = await fetch(`${origin}/api/v1/capabilities`, { headers: { Authorization: `Bearer ${runtime.token}`, Origin: origin } });
  expect(capabilities.status).toBe(200);
  const capabilityEnvelope = await capabilities.json() as { readonly data: { readonly schemaVersion: number; readonly capabilities: readonly { readonly id: string; readonly surfaces: readonly string[] }[] } };
  expect(capabilityEnvelope.data.schemaVersion).toBe(1);
  expect(capabilityEnvelope.data.capabilities).toHaveLength(15);
  expect(capabilityEnvelope.data.capabilities.find((item) => item.id === "doctor.inspect")?.surfaces).toContain("web");
  expect(capabilityEnvelope.data.capabilities.find((item) => item.id === "doctor.repair_preview")?.surfaces).toContain("web");
  expect(capabilityEnvelope.data.capabilities.find((item) => item.id === "doctor.repair_apply")?.surfaces).toContain("web");
  expect(capabilityEnvelope.data.capabilities.find((item) => item.id === "project.set_orchestration_mode")?.surfaces).toContain("web");
  expect(capabilityEnvelope.data.capabilities.find((item) => item.id === "agent.replace")?.surfaces).toContain("web");
  const doctorPreview = await fetch(`${origin}/api/v1/doctor/repair-preview`, { method: "POST", headers: { Authorization: `Bearer ${runtime.token}`, Origin: origin, "Content-Type": "application/json" }, body: "{}" });
  expect(doctorPreview.status).toBe(200);
  const doctorPlan = await doctorPreview.json() as { readonly data: { readonly fingerprint: string; readonly expiresAt: string; readonly report: { readonly mode: string } } };
  expect(doctorPlan.data.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  expect(doctorPlan.data.report.mode).toBe("repair-dry-run");
  expect(Date.parse(doctorPlan.data.expiresAt)).toBeGreaterThan(Date.now());
  const unconfirmedRepair = await fetch(`${origin}/api/v1/doctor/repair-apply`, { method: "POST", headers: { Authorization: `Bearer ${runtime.token}`, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ fingerprint: doctorPlan.data.fingerprint, confirmed: false }) });
  expect(unconfirmedRepair.status).toBe(400);
  expect(await errorCode(unconfirmedRepair)).toBe("invalid_doctor_confirmation");
  const legacyRepair = await fetch(`${origin}/api/v1/doctor/repair`, { method: "POST", headers: { Authorization: `Bearer ${runtime.token}`, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ apply: true, confirmed: true }) });
  expect(legacyRepair.status).toBe(404);
  const unexpected = await fetch(`${origin}/api/v1/framing/enter`, {
    method: "POST",
    headers: { Authorization: `Bearer ${runtime.token}`, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ root: projectRoot, ignored: true }),
  });
  expect(unexpected.status).toBe(400);
  expect(await errorCode(unexpected)).toBe("unexpected_field");
  const oversized = await fetch(`${origin}/api/v1/framing/enter`, {
    method: "POST",
    headers: { Authorization: `Bearer ${runtime.token}`, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ root: `/${"x".repeat(64 * 1024)}` }),
  });
  expect(oversized.status).toBe(413);
  expect(await errorCode(oversized)).toBe("body_too_large");
  const control = await fetch(`${origin}/api/v1/projects/demo/orchestrations/start`, { method: "POST", headers: { Authorization: `Bearer ${runtime.token}`, Origin: origin } });
  expect(control.status).toBe(404);
  const shell = await fetch(origin);
  expect(shell.headers.get("content-security-policy")).toContain("default-src 'self'");
});

test("Project framing enters and resumes as a draft without marker, Feature or workflow", async ({ page }) => {
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
  await page.getByRole("button", { name: "Frame a Project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "Frame a Project" });
  await expect(projectDialog.getByRole("textbox", { name: /^Name/ })).toHaveCount(0);
  await expect(projectDialog.getByText("No marker, Feature or workflow is created now.", { exact: false })).toBeVisible();
  await projectDialog.getByRole("button", { name: "Choose folder" }).click();
  await expect(projectDialog.getByText(projectRoot)).toBeVisible();
  const continueButton = projectDialog.getByRole("button", { name: "Continue to framing" });
  await expect(continueButton).toBeEnabled();
  const runtime = requiredServer();
  const origin = new URL(runtime.url).origin;
  const stream = await fetch(`${origin}/api/v1/events`, { headers: { Authorization: `Bearer ${runtime.token}`, Origin: origin } });
  expect(stream.status).toBe(200);
  const persistedInvalidation = nextInvalidation(stream.body, (event) => event.scope === "project");
  const entryResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/framing/enter") && response.request().method() === "POST");
  await continueButton.click();
  const entered = await entryResponse;
  expect(entered.status()).toBe(201);
  const enteredEnvelope = await entered.json() as { readonly data: { readonly id: string } };
  expect((await persistedInvalidation).projectId).toBe(enteredEnvelope.data.id);

  await expect(page.getByRole("heading", { name: "project", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This Project is still being framed" })).toBeVisible();
  await expect(page.getByText("The plan is private and resumable.", { exact: false })).toBeVisible();
  await expect(page.locator(".sidebar").getByRole("button", { name: /^Features/ })).toBeDisabled();
  await expect(page.locator(".sidebar").getByRole("button", { name: /^Settings/ })).toBeDisabled();
  await expect(page.locator(".sidebar").getByRole("button", { name: /^Overview/ })).toBeEnabled();
  await expect(page.locator(".metric-strip")).toHaveCount(0);
  await expect(page.locator(".feature-table-section")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(access(resolve(projectRoot, ".arka-norn", "project.json")).then(() => true).catch(() => false)).resolves.toBe(false);

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("heading", { name: "Project frame", exact: true })).toBeVisible();
  await expect(page.getByText("The plan is being opened")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy resume context" })).toBeVisible();

  await page.getByRole("button", { name: "FR" }).click();
  await expect(page.getByRole("tab", { name: "Plan" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-navigation").getByRole("button", { name: "Features" })).toBeDisabled();
  await expect(page.locator(".mobile-navigation").getByRole("button", { name: "Plus" })).toBeDisabled();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test("materialized Project keeps the complete tracking experience in EN and FR", async ({ page }) => {
  await page.goto(requiredServer().url);
  await createMaterializedProject(page);
  await page.evaluate(() => { window.location.hash = "#/projects/demo-project/overview"; });

  await expect(page.getByRole("heading", { name: "Demo Project" })).toBeVisible();
  const switchToEnglish = page.getByRole("button", { name: "EN", exact: true });
  if (await switchToEnglish.count() > 0) await switchToEnglish.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "How assistants are launched" })).toBeVisible();
  await expect(page.getByText("Manual launch", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change mode" }).click();
  const modeDialog = page.getByRole("dialog", { name: "Change assistant launch mode" });
  await modeDialog.getByRole("radio", { name: /Assisted mode/ }).check();
  await expect(modeDialog.getByText("Assisted mode needs at least one enabled execution profile", { exact: false })).toBeVisible();
  await expect(modeDialog.getByRole("button", { name: "Save" })).toBeDisabled();
  await modeDialog.getByRole("button", { name: "Cancel" }).click();
  const modeContract = await projectModeContract(page);
  expect(modeContract.preflightStatus).toBe(422);
  expect(modeContract.preflightCode).toBe("automatic_preflight_required");
  expect(modeContract.preflightMessage).toContain("enabled execution profile");
  expect(modeContract.conflictStatus).toBe(409);
  expect(modeContract.conflictCode).toBe("project_changed");
  expect(modeContract.orchestrationCount).toBe(0);
  await page.locator(".sidebar").getByRole("button", { name: /^Agents/ }).click();
  await page.getByRole("button", { name: "Register Agent" }).click();
  const registerAgent = page.getByRole("dialog", { name: "Register an Agent" });
  await registerAgent.getByLabel("Provider").fill("Claude");
  await registerAgent.getByRole("button", { name: "Confirm" }).click();
  await expect(page.locator(".agent-list article")).toHaveCount(1);
  await expect(page.getByText("main", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Replace" }).click();
  const replaceAgent = page.getByRole("dialog", { name: "Replace this Agent" });
  await replaceAgent.getByLabel("Provider").fill("ChatGPT");
  await replaceAgent.getByRole("button", { name: "Confirm" }).click();
  await expect(page.locator(".agent-list article")).toHaveCount(2);
  await expect(page.locator(".agent-list article.is-inactive")).toHaveCount(1);
  await page.locator(".sidebar").getByRole("button", { name: /^Overview/ }).click();
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
  const projectIndex = resolve(sandbox, "home", ".arka-norn", "index", "projects.json");
  await chmod(projectIndex, 0o644);
  await page.getByRole("button", { name: "Inspecter avec Doctor" }).click();
  await expect(page.locator(".doctor-report")).toBeVisible();
  await expect(page.locator("pre.doctor-output")).toHaveCount(0);
  await page.getByRole("button", { name: "Simuler les réparations" }).click();
  await expect(page.getByText("Changements prévus")).toBeVisible();
  await expect(page.getByText("Rendre le fichier privé (0600)")).toBeVisible();
  await chmod(projectIndex, 0o600);
  await page.getByRole("checkbox", { name: /J'ai vérifié le plan/ }).check();
  await page.getByRole("button", { name: "Appliquer les réparations vérifiées" }).click();
  await expect(page.getByRole("alert")).toContainText("L'espace de travail a changé");
  await expect(page.getByText("Ce plan ne contient aucune réparation à appliquer.")).toBeVisible();

  await chmod(projectIndex, 0o644);
  await page.getByRole("button", { name: "Inspecter avec Doctor" }).click();
  await page.getByRole("button", { name: "Simuler les réparations" }).click();
  await page.getByRole("checkbox", { name: /J'ai vérifié le plan/ }).check();
  await page.getByRole("button", { name: "Appliquer les réparations vérifiées" }).click();
  await expect(page.getByRole("status")).toContainText("Doctor a inspecté de nouveau");
  expect((await stat(projectIndex)).mode & 0o777).toBe(0o600);

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
    const envelope = await response.json() as { readonly data?: readonly { readonly id: string; readonly featureCount?: number }[] };
    return envelope.data?.find((project) => project.id === "demo-project")?.featureCount;
  });
}

async function projectModeContract(page: Page): Promise<{ readonly preflightStatus: number; readonly preflightCode: string; readonly preflightMessage: string; readonly conflictStatus: number; readonly conflictCode: string; readonly orchestrationCount: number }> {
  return page.evaluate(async () => {
    const token = sessionStorage.getItem("arka-norn-web-token") ?? "";
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const overviewResponse = await fetch("/api/v1/projects/demo-project", { headers });
    const overview = await overviewResponse.json() as { readonly data: { readonly updatedAt: string } };
    const preflight = await fetch("/api/v1/projects/demo-project/orchestration-mode", { method: "PUT", headers, body: JSON.stringify({ mode: "automatic", expectedUpdatedAt: overview.data.updatedAt }) });
    const preflightEnvelope = await preflight.json() as { readonly errors: readonly { readonly code: string }[]; readonly display: { readonly message: string } };
    const conflict = await fetch("/api/v1/projects/demo-project/orchestration-mode", { method: "PUT", headers, body: JSON.stringify({ mode: "manual", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }) });
    const conflictEnvelope = await conflict.json() as { readonly errors: readonly { readonly code: string }[] };
    const orchestrations = await fetch("/api/v1/projects/demo-project/orchestrations", { headers });
    const orchestrationEnvelope = await orchestrations.json() as { readonly data: readonly unknown[] };
    return {
      preflightStatus: preflight.status,
      preflightCode: preflightEnvelope.errors[0]?.code ?? "",
      preflightMessage: preflightEnvelope.display.message,
      conflictStatus: conflict.status,
      conflictCode: conflictEnvelope.errors[0]?.code ?? "",
      orchestrationCount: orchestrationEnvelope.data.length,
    };
  });
}

async function createMaterializedProject(page: Page): Promise<void> {
  const runtime = requiredServer();
  const origin = new URL(runtime.url).origin;
  const response = await page.evaluate(async ({ root, token, requestOrigin }) => fetch("/api/v1/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Origin: requestOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ id: "demo-project", name: "Demo Project", root }),
  }).then(async (result) => ({ status: result.status, body: await result.text() })), { root: materializedRoot, token: runtime.token, requestOrigin: origin });
  expect(response.status, response.body).toBe(201);
}

function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function requiredServer(): RunningWebServer {
  if (server === undefined) throw new Error("Web test server did not start.");
  return server;
}

async function errorCode(response: Response): Promise<string | undefined> {
  const envelope = await response.json() as { readonly errors?: readonly { readonly code?: string }[] };
  return envelope.errors?.[0]?.code;
}

async function nextInvalidation(
  body: ReadableStream<Uint8Array> | null,
  predicate: (event: LiveInvalidation) => boolean,
): Promise<LiveInvalidation> {
  if (body === null) throw new Error("SSE response body is missing.");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error("SSE stream ended before the expected invalidation.");
      buffer += decoder.decode(chunk.value, { stream: true });
      const messages = buffer.split("\n\n");
      buffer = messages.pop() ?? "";
      for (const message of messages) {
        const data = message.split("\n").find((line) => line.startsWith("data: "));
        if (data === undefined) continue;
        const event = JSON.parse(data.slice(6)) as LiveInvalidation;
        if (predicate(event)) return event;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
