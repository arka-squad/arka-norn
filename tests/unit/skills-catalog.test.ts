/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { createSkillCatalogRuntime } from "../../src/adapters/outbound/skills/skill-catalog.js";

interface CatalogEntry {
  readonly name: string;
  readonly version: string;
  readonly source: string;
  readonly checksum: string;
  readonly profiles: readonly string[];
  readonly step: string;
}

interface SkillDefinition {
  readonly name: string;
  readonly summary: string;
  readonly triggers: string;
  readonly whenToUse: readonly string[];
  readonly whenNotToUse: readonly string[];
  readonly inputs: readonly unknown[];
  readonly procedure: readonly { readonly content: string }[];
  readonly outputFormat: string;
}

const ROOT = resolve(import.meta.dirname, "..", "..");
const SOURCE = resolve(ROOT, "skills-src");
const catalog = JSON.parse(readFileSync(resolve(SOURCE, "catalog", "skills.json"), "utf8")) as { readonly skills: readonly CatalogEntry[] };

test("le catalogue contient exactement les 21 skills requis et des checksums exacts", () => {
  const required = [
    "arka-norn",
    "arka-audit",
    "arka-product",
    "arka-fastdev",
    "arka-essential",
    "arka-framework-mastery", "arka-framework-status", "arka-framework-scaffold", "arka-framework-validate", "arka-framework-handoff",
    "arka-framework-concept", "arka-framework-plan", "arka-framework-technical-appendix", "arka-framework-audit",
    "arka-framework-invariants", "arka-framework-debt-register", "arka-framework-tasks", "arka-framework-integration-specification",
    "arka-framework-development", "arka-framework-qa-review",
    "arka-git-steward",
  ].sort();
  assert.deepEqual(catalog.skills.map((entry) => entry.name).sort(), required);
  assert.equal(new Set(catalog.skills.map((entry) => entry.name)).size, 21);
  for (const entry of catalog.skills) {
    const raw = readFileSync(resolve(SOURCE, entry.source), "utf8").replace(/\r\n?/g, "\n");
    assert.equal(createHash("sha256").update(raw, "utf8").digest("hex"), entry.checksum, entry.name);
    assert.ok(entry.profiles.includes("all"));
    assert.ok(entry.step.length > 0);
  }
  assert.equal(catalog.skills.filter((entry) => entry.profiles.includes("core")).length, 10);
  assert.equal(catalog.skills.filter((entry) => entry.profiles.includes("delivery")).length, 18);
  assert.deepEqual(Object.fromEntries(["product", "architecture", "audit", "dev", "qa"].map((profile) => [profile, catalog.skills.filter((entry) => entry.profiles.includes(profile)).length])), {
    product: 13, architecture: 12, audit: 11, dev: 11, qa: 10,
  });
});

test("every definition is English, locale-aware and constrained to one verified phase", () => {
  const files = readdirSync(SOURCE).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 21);
  const definitions = files.map((file) => JSON.parse(readFileSync(resolve(SOURCE, file), "utf8")) as SkillDefinition);
  for (const definition of definitions) {
    assert.match(definition.name, /^(?:arka-norn|arka-audit|arka-product|arka-fastdev|arka-essential|arka-git-steward|arka-framework-[a-z-]+)$/);
    assert.ok(definition.summary.length > 20);
    assert.match(definition.triggers, /English triggers include/);
    assert.match(definition.triggers, /French triggers include/);
    assert.ok(definition.whenToUse.length > 0);
    assert.ok(definition.whenNotToUse.length > 0);
    assert.ok(definition.inputs.length > 0);
    assert.ok(definition.procedure.length >= 3);
    assert.ok(definition.outputFormat.length > 10);
  }
  const byName = new Map(definitions.map((definition) => [definition.name, JSON.stringify(definition)]));
  for (const content of byName.values()) {
    assert.match(content, /locale show --json/);
    assert.match(content, /content_locale/);
    assert.match(content, /(?:pipeline|essential|fastdev) next.*--json/);
    assert.match(content, /Do not execute a second phase/);
  }
  assert.match(byName.get("arka-fastdev") ?? "", /rework_brief/);
  assert.match(byName.get("arka-essential") ?? "", /feature_brief/);
  assert.match(byName.get("arka-framework-development") ?? "", /development_report/);
  assert.match(byName.get("arka-framework-qa-review") ?? "", /qa_review/);
});

test("le catalogue reste vérifiable après une conversion Git en CRLF", (context) => {
  const frameworkRoot = mkdtempSync(resolve(tmpdir(), "arka-norn-catalog-crlf-"));
  context.after(() => rmSync(frameworkRoot, { recursive: true, force: true }));
  cpSync(SOURCE, resolve(frameworkRoot, "skills-src"), { recursive: true });
  for (const entry of catalog.skills) {
    const sourcePath = resolve(frameworkRoot, "skills-src", entry.source);
    const crlf = readFileSync(sourcePath, "utf8").replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
    writeFileSync(sourcePath, crlf);
  }
  assert.equal(createSkillCatalogRuntime(frameworkRoot).definitions.length, 21);
});

test("les rendus Agents ont un frontmatter YAML sûr et une description UI bornée", () => {
  const runtime = createSkillCatalogRuntime(ROOT);
  for (const definition of runtime.definitions) {
    const markdown = runtime.renderRepoSkillMd(definition);
    const descriptionLine = markdown.split("\n").find((line) => line.startsWith("description: "));
    assert.ok(descriptionLine);
    assert.doesNotThrow(() => JSON.parse(descriptionLine.slice("description: ".length)));
    const yaml = runtime.renderOpenaiYaml(definition);
    const shortLine = yaml.split("\n").find((line) => line.startsWith("  short_description: "));
    assert.ok(shortLine);
    const shortDescription = JSON.parse(shortLine.slice("  short_description: ".length)) as string;
    assert.ok(shortDescription.length >= 25 && shortDescription.length <= 64, `${definition.name}: ${shortDescription.length}`);
    const defaultLine = yaml.split("\n").find((line) => line.startsWith("  default_prompt: "));
    assert.ok(defaultLine);
    assert.match(JSON.parse(defaultLine.slice("  default_prompt: ".length)) as string, new RegExp(`\\$${definition.name}`));
    assert.match(runtime.renderGlobalSkillMd(definition), new RegExp(`version: ${definition.catalog.version.replaceAll(".", "\\.")}`));
  }
  assert.match(runtime.renderOpenaiYaml(runtime.definitions.find((definition) => definition.name === "arka-norn")!), /Arka Norn bootstrap/);
});

test("the global arka-norn rendering uses the canonical locale-aware phase gate", () => {
  const runtime = createSkillCatalogRuntime(ROOT);
  const definition = runtime.definitions.find((item) => item.name === "arka-norn");
  assert.ok(definition);
  const rendered = runtime.renderGlobalSkillMd(definition);

  assert.match(rendered, /locale show --json/);
  assert.match(rendered, /Machine-readable CLI data is the source of truth/);
  assert.match(rendered, /pipeline next <feature> --json/);
  assert.match(rendered, /signed and mechanically validated artifact/);
  assert.match(rendered, /Do not execute a second phase/);
});

test("the global Product rendering strictly separates automatic orchestration from manual handoff", () => {
  const runtime = createSkillCatalogRuntime(ROOT);
  const definition = runtime.definitions.find((item) => item.name === "arka-product");
  assert.ok(definition);
  const rendered = runtime.renderGlobalSkillMd(definition);

  assert.match(rendered, /Reply in the active display locale/);
  assert.match(rendered, /In automatic mode, never call `agent prompt`/);
  assert.match(rendered, /display a copy\/paste prompt/);
  assert.match(rendered, /local authenticated CLI provider/);
  assert.match(rendered, /In manual mode only/);
  assert.match(rendered, /orchestration preview/);
  assert.match(rendered, /Do not execute a second phase/);
});
