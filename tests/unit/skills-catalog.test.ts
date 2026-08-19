import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

interface CatalogEntry {
  readonly name: string;
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

test("le catalogue contient exactement les 14 skills requis et des checksums exacts", () => {
  const required = [
    "arka-framework-statut", "arka-framework-scaffold", "arka-framework-valider", "arka-framework-handoff",
    "arka-framework-concept", "arka-framework-plan", "arka-framework-annexe-technique", "arka-framework-audit",
    "arka-framework-invariants", "arka-framework-dettes", "arka-framework-taches", "arka-framework-spec-integration",
    "arka-framework-dev", "arka-framework-recette-qa",
  ].sort();
  assert.deepEqual(catalog.skills.map((entry) => entry.name).sort(), required);
  assert.equal(new Set(catalog.skills.map((entry) => entry.name)).size, 14);
  for (const entry of catalog.skills) {
    const raw = readFileSync(resolve(SOURCE, entry.source));
    assert.equal(createHash("sha256").update(raw).digest("hex"), entry.checksum, entry.name);
    assert.ok(entry.profiles.includes("all"));
    assert.ok(entry.step.length > 0);
  }
  assert.equal(catalog.skills.filter((entry) => entry.profiles.includes("core")).length, 4);
  assert.equal(catalog.skills.filter((entry) => entry.profiles.includes("delivery")).length, 12);
});

test("chaque définition est complète et les skills audit/dev/QA imposent leurs gates", () => {
  const files = readdirSync(SOURCE).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 14);
  const definitions = files.map((file) => JSON.parse(readFileSync(resolve(SOURCE, file), "utf8")) as SkillDefinition);
  for (const definition of definitions) {
    assert.match(definition.name, /^arka-framework-[a-z-]+$/);
    assert.ok(definition.description_courte.length > 20);
    assert.ok(definition.quand_utiliser.length > 0);
    assert.ok(definition.quand_ne_pas_utiliser.length > 0);
    assert.ok(definition.inputs.length > 0);
    assert.ok(definition.procedure.length >= 3);
    assert.ok(definition.format_sortie.length > 10);
  }
  const byName = new Map(definitions.map((definition) => [definition.name, JSON.stringify(definition)]));
  assert.match(byName.get("arka-framework-audit") ?? "", /preuves reproductibles|Vérifier directement/);
  assert.match(byName.get("arka-framework-audit") ?? "", /correction silencieuse/);
  assert.match(byName.get("arka-framework-dev") ?? "", /scope_fichiers/);
  assert.match(byName.get("arka-framework-dev") ?? "", /CR de dev|cr_dev/);
  assert.match(byName.get("arka-framework-recette-qa") ?? "", /dernier CR|cr_dev_id/);
  assert.match(byName.get("arka-framework-recette-qa") ?? "", /partial|fail/);
});
