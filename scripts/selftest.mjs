#!/usr/bin/env node
// Sous-commande CLI : arka-norn selftest
// Batterie de vérifications RÉELLES du framework (pas de simulation) :
//  1. Chaque schema du pipeline compile (Ajv) et son scaffold se génère sans exception.
//  2. Le scaffold d'un type échoue à la validation UNIQUEMENT sur des valeurs sentinelles
//     (pas sur des clés manquantes) — preuve que la forme générée est structurellement complète.
//  3. L'exemple réel de chaque type (dérivé de la vraie feature Notion/Linear du dépôt)
//     valide intégralement contre son schema.
//  4. Retirer un champ requis d'un exemple réel casse la validation avec une erreur
//     nommant exactement ce champ (pas un échec générique).
//  5. status applique le verdict métier de la recette et les codes de sortie.
//  6. L'entrypoint TUI refuse proprement un environnement non interactif.
//  7. Le catalogue public contient exactement les 14 skills attendus.
//  8. Le code TypeScript, le build et les tests passent réellement.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadJson, loadPipeline, validateDocument, FRAMEWORK_ROOT } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(FRAMEWORK_ROOT, "bin", "arka-norn.mjs");
const TSC_BIN = path.join(FRAMEWORK_ROOT, "node_modules", "typescript", "bin", "tsc");
const TEST_RUNNER = path.join(FRAMEWORK_ROOT, "tests", "run-tests.mjs");
const CLEAN_DIST = path.join(FRAMEWORK_ROOT, "scripts", "clean-dist.mjs");

export function runSelftest() {
  let failures = 0;
  let checks = 0;

  function check(label, condition, detail) {
    checks++;
    if (condition) {
      console.log(`  OK   ${label}`);
    } else {
      failures++;
      console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`);
    }
  }

  const pipeline = loadPipeline();
  const allTypeIds = [...pipeline.steps.map((s) => s.id), "handoff"];
  const EXAMPLES_DIR = path.join(FRAMEWORK_ROOT, "examples", "feature-notion-linear");
  const EXAMPLE_FILE_BY_TYPE = {
    concept: "01-concept.json",
    plan: "02-plan.json",
    annexe_contrat_technique: "03-annexe.json",
    audit_etat_reel: "04-audit-etat-reel.json",
    invariants_figes: "05-invariants-figes.json",
    registre_dettes: "06-registre-dettes.json",
    tache_agent: "07-tache-agent.json",
    spec_integration_technique: "08-spec-integration-technique.json",
    cr_dev: "09-cr-dev.json",
    recette_qa: "10-recette-qa.json",
    handoff: "11-handoff.json",
  };

  console.log("=== 1+2. scaffold pour chaque type : génération + échec attendu uniquement sur sentinelles ===");
  const tmpDir = mkdtempSync(path.join(tmpdir(), "arka-norn-selftest-"));
  for (const typeId of allTypeIds) {
    const outFile = path.join(tmpDir, `${typeId}.json`);
    try {
      execFileSync(process.execPath, [BIN, "scaffold", typeId, outFile], { stdio: "pipe" });
    } catch (err) {
      check(`scaffold(${typeId}) ne lève pas d'exception`, false, err.message);
      continue;
    }
    check(`scaffold(${typeId}) ne lève pas d'exception`, true);

    const scaffolded = loadJson(outFile);
    const result = validateDocument(scaffolded);
    const noStructuralErrors = result.errors.every((e) => e.keyword !== "required" && e.keyword !== "additionalProperties");
    check(`scaffold(${typeId}) échoue (sentinelles non remplacées) mais jamais sur une clé manquante`, !result.ok && noStructuralErrors, JSON.stringify(result.errors));
  }
  rmSync(tmpDir, { recursive: true, force: true });

  console.log("\n=== 3. Chaque exemple réel (feature Notion/Linear) valide contre son schema ===");
  for (const typeId of allTypeIds) {
    const filename = EXAMPLE_FILE_BY_TYPE[typeId];
    const absPath = path.join(EXAMPLES_DIR, filename);
    const doc = loadJson(absPath);
    const result = validateDocument(doc);
    check(`${filename} (type ${typeId}) valide`, result.ok, JSON.stringify(result.errors));
  }

  console.log("\n=== 4. Un champ requis manquant casse la validation avec une erreur nommant ce champ ===");
  {
    const doc = loadJson(path.join(EXAMPLES_DIR, "01-concept.json"));
    delete doc.objectif;
    const result = validateDocument(doc);
    const namesTheField = !result.ok && result.errors.some((e) => e.params && e.params.missingProperty === "objectif");
    check("retirer 'objectif' du concept réel échoue en nommant 'objectif'", namesTheField, JSON.stringify(result.errors));
  }
  {
    const doc = loadJson(path.join(EXAMPLES_DIR, "09-cr-dev.json"));
    doc.fichiers_livres[0].action = "valeur_inventee";
    const result = validateDocument(doc);
    const rejectsInventedEnum = !result.ok;
    check("une valeur enum inventée sur fichiers_livres[].action est rejetée", rejectsInventedEnum, JSON.stringify(result.errors));
  }

  console.log("\n=== 5. status applique le verdict métier de la recette QA ===");
  {
    const result = spawnSync(process.execPath, [BIN, "status", EXAMPLES_DIR], { encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    check("status sort avec le code 2 pour une recette QA non concluante", result.status === 2, output);
    check("status n'annonce jamais 'Pipeline complet' pour une recette QA fail", !output.includes("Pipeline complet"), output);
    check("status renvoie explicitement vers cr_dev", output.includes("return_to_development -> cr_dev"), output);
  }

  console.log("\n=== 6. L'entrypoint TUI refuse un environnement non interactif ===");
  {
    const result = spawnSync(process.execPath, [BIN], { encoding: "utf8" });
    check("TUI hors TTY : code de sortie 1", result.status === 1, `${result.stdout ?? ""}${result.stderr ?? ""}`);
    check("TUI hors TTY : aucun rendu sur stdout", result.stdout === "", result.stdout ?? "");
    check("TUI hors TTY : message explicite sur stderr", (result.stderr ?? "").includes("nécessite un terminal interactif"), result.stderr ?? "");
  }

  console.log("\n=== 7. Catalogue partagé : exactement 14 skills, dont audit/dev/QA ===");
  {
    const catalog = loadJson(path.join(FRAMEWORK_ROOT, "skills-src", "catalog", "skills.json"));
    const names = catalog.skills.map((skill) => skill.name);
    check("catalogue contient exactement 14 skills", names.length === 14 && new Set(names).size === 14, names.join(", "));
    check("catalogue contient audit", names.includes("arka-framework-audit"), names.join(", "));
    check("catalogue contient dev", names.includes("arka-framework-dev"), names.join(", "));
    check("catalogue contient recette QA", names.includes("arka-framework-recette-qa"), names.join(", "));
    const listed = spawnSync(process.execPath, [BIN, "skills", "list", "--json"], { cwd: FRAMEWORK_ROOT, encoding: "utf8" });
    const listedData = listed.status === 0 ? JSON.parse(listed.stdout).data : [];
    check("CLI skills list consomme les mêmes 14 entrées", listed.status === 0 && listedData.length === 14, `${listed.stdout ?? ""}${listed.stderr ?? ""}`);
  }

  console.log("\n=== 8. Gates TypeScript : typecheck, build et tests ===");
  runGate("typecheck du code source", [TSC_BIN, "--noEmit"]);
  runGate("typecheck des tests", [TSC_BIN, "-p", path.join(FRAMEWORK_ROOT, "tsconfig.tests.json")]);
  runGate("nettoyage du build précédent", [CLEAN_DIST]);
  runGate("build TypeScript reproductible", [TSC_BIN]);
  runGate("tests TypeScript", [TEST_RUNNER]);

  console.log(`\n${checks - failures}/${checks} vérifications passées.`);
  if (failures > 0) {
    console.log(`${failures} ÉCHEC(S) — le framework n'est pas fiable en l'état, corriger avant usage.`);
    process.exit(1);
  } else {
    console.log("Toutes les vérifications réelles passent.");
    process.exit(0);
  }

  function runGate(label, args) {
    const result = spawnSync(process.execPath, args, { cwd: FRAMEWORK_ROOT, encoding: "utf8" });
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    check(label, result.status === 0, detail || `process terminé avec le code ${String(result.status)}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) runSelftest();
