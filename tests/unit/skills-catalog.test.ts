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
  readonly description_courte: string;
  readonly quand_utiliser: readonly string[];
  readonly quand_ne_pas_utiliser: readonly string[];
  readonly inputs: readonly unknown[];
  readonly procedure: readonly { readonly contenu: string }[];
  readonly format_sortie: string;
}

const ROOT = resolve(import.meta.dirname, "..", "..");
const SOURCE = resolve(ROOT, "skills-src");
const catalog = JSON.parse(readFileSync(resolve(SOURCE, "catalog", "skills.json"), "utf8")) as { readonly skills: readonly CatalogEntry[] };

test("le catalogue contient exactement les 18 skills requis et des checksums exacts", () => {
  const required = [
    "arka-norn",
    "arka-product",
    "arka-fastdev",
    "arka-framework-maitrise", "arka-framework-statut", "arka-framework-scaffold", "arka-framework-valider", "arka-framework-handoff",
    "arka-framework-concept", "arka-framework-plan", "arka-framework-annexe-technique", "arka-framework-audit",
    "arka-framework-invariants", "arka-framework-dettes", "arka-framework-taches", "arka-framework-spec-integration",
    "arka-framework-dev", "arka-framework-recette-qa",
  ].sort();
  assert.deepEqual(catalog.skills.map((entry) => entry.name).sort(), required);
  assert.equal(new Set(catalog.skills.map((entry) => entry.name)).size, 18);
  for (const entry of catalog.skills) {
    const raw = readFileSync(resolve(SOURCE, entry.source), "utf8").replace(/\r\n?/g, "\n");
    assert.equal(createHash("sha256").update(raw, "utf8").digest("hex"), entry.checksum, entry.name);
    assert.ok(entry.profiles.includes("all"));
    assert.ok(entry.step.length > 0);
  }
  assert.equal(catalog.skills.filter((entry) => entry.profiles.includes("core")).length, 8);
  assert.equal(catalog.skills.filter((entry) => entry.profiles.includes("delivery")).length, 16);
  assert.deepEqual(Object.fromEntries(["product", "architecture", "audit", "dev", "qa"].map((profile) => [profile, catalog.skills.filter((entry) => entry.profiles.includes(profile)).length])), {
    product: 11, architecture: 10, audit: 9, dev: 9, qa: 8,
  });
});

test("chaque définition est complète et les skills audit/dev/QA imposent leurs gates", () => {
  const files = readdirSync(SOURCE).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 18);
  const definitions = files.map((file) => JSON.parse(readFileSync(resolve(SOURCE, file), "utf8")) as SkillDefinition);
  for (const definition of definitions) {
    assert.match(definition.name, /^(?:arka-norn|arka-product|arka-fastdev|arka-framework-[a-z-]+)$/);
    assert.ok(definition.description_courte.length > 20);
    assert.ok(definition.quand_utiliser.length > 0);
    assert.ok(definition.quand_ne_pas_utiliser.length > 0);
    assert.ok(definition.inputs.length > 0);
    assert.ok(definition.procedure.length >= 3);
    assert.ok(definition.format_sortie.length > 10);
  }
  const byName = new Map(definitions.map((definition) => [definition.name, JSON.stringify(definition)]));
  assert.match(byName.get("arka-norn") ?? "", /\/arka-norn.*\$arka-norn/);
  assert.match(byName.get("arka-norn") ?? "", /skills doctor.*project scan.*agent register/);
  assert.match(byName.get("arka-norn") ?? "", /Ne jamais créer|ne pas utiliser `--force`/i);
  assert.match(byName.get("arka-norn") ?? "", /Product principal.*session `main`/i);
  assert.match(byName.get("arka-product") ?? "", /agent advise.*agent prompt.*agent handoff-prompt/);
  assert.match(byName.get("arka-product") ?? "", /ne produit pas lui-même.*architecture.*audit.*développement.*QA/i);
  assert.match(byName.get("arka-product") ?? "", /demander explicitement.*assistant.*version.*aperçu.*confirmation/i);
  assert.match(byName.get("arka-product") ?? "", /orchestration configure.*--provider.*--model.*orchestration preview.*orchestration start.*--preview/i);
  assert.doesNotMatch(byName.get("arka-product") ?? "", /sélecteur Project le choisit de façon déterministe|ne demander ni provider libre/i);
  assert.match(byName.get("arka-fastdev") ?? "", /fastdev next.*une seule action|exactement une action calculée/i);
  assert.match(byName.get("arka-fastdev") ?? "", /corrections_apportees.*audit_rework.*validation_fastdev/);
  assert.match(byName.get("arka-fastdev") ?? "", /agent current.*--session.*fastdev next.*--session.*suggestedCommand.*--session/);
  assert.match(byName.get("arka-framework-audit") ?? "", /preuves reproductibles|Vérifier directement/);
  assert.match(byName.get("arka-framework-audit") ?? "", /correction silencieuse/);
  assert.match(byName.get("arka-framework-dev") ?? "", /scope_fichiers/);
  assert.match(byName.get("arka-framework-dev") ?? "", /CR de dev|cr_dev/);
  assert.match(byName.get("arka-framework-recette-qa") ?? "", /dernier CR|cr_dev_id/);
  assert.match(byName.get("arka-framework-recette-qa") ?? "", /partial|fail/);
  assert.match(byName.get("arka-framework-maitrise") ?? "", /agent register/);
  assert.match(byName.get("arka-framework-maitrise") ?? "", /Ne jamais déduire|ne pas.*deviner/i);
  assert.match(byName.get("arka-framework-concept") ?? "", /ChatGPT.*Claude\.ai/);
  assert.match(byName.get("arka-framework-concept") ?? "", /PROMPT À COPIER|kit prêt à transmettre/);
  assert.match(byName.get("arka-framework-concept") ?? "", /proposition non fiable/);
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
  assert.equal(createSkillCatalogRuntime(frameworkRoot).definitions.length, 18);
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
  assert.match(runtime.renderOpenaiYaml(runtime.definitions.find((definition) => definition.name === "arka-norn")!), /Arka Norn — Démarrer/);
});

test("le rendu global arka-norn porte la gate de mode et le contrôle des 18 skills", () => {
  const runtime = createSkillCatalogRuntime(ROOT);
  const definition = runtime.definitions.find((item) => item.name === "arka-norn");
  assert.ok(definition);
  const rendered = runtime.renderGlobalSkillMd(definition);

  assert.match(rendered, /mode_orchestration/);
  assert.match(rendered, /`manual` ou `automatic`/);
  assert.match(rendered, /Ne jamais créer, choisir un autre dossier ou déduire le mode silencieusement/);
  assert.match(rendered, /project add <racine> --name <nom> --orchestration-mode <manual\|automatic>/);
  assert.match(rendered, /skills doctor --target <racine> --profile all --global --json/);
  assert.match(rendered, /skills install --target <racine> --profile all --global/);
  assert.match(rendered, /les 18 skills/);
  assert.match(rendered, /--force.*décision explicite de l’utilisateur/);
});

test("le rendu global arka-product demande assistant, modèle, aperçu et confirmation", () => {
  const runtime = createSkillCatalogRuntime(ROOT);
  const definition = runtime.definitions.find((item) => item.name === "arka-product");
  assert.ok(definition);
  const rendered = runtime.renderGlobalSkillMd(definition);

  assert.match(rendered, /demander explicitement.*assistant.*version/i);
  assert.match(rendered, /orchestration configure --project <project-id> --provider <claude\|codex\|kimi\|zai> --model <version>/);
  assert.match(rendered, /orchestration preview --project <project-id> --feature <feature-id>/);
  assert.match(rendered, /attendre la confirmation explicite de l'utilisateur/i);
  assert.match(rendered, /orchestration start --project <project-id> --feature <feature-id> --provider <claude\|codex\|kimi\|zai> --model <version> --preview <empreinte>/);
  assert.doesNotMatch(rendered, /sélecteur Project le choisit de façon déterministe|ne demander ni provider libre/i);
});
