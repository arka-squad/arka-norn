#!/usr/bin/env node

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

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPipelineRuntime } from "../dist/composition/pipeline-runtime.js";

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(FRAMEWORK_ROOT, "bin", "arka-norn.mjs");
const TSC_BIN = path.join(FRAMEWORK_ROOT, "node_modules", "typescript", "bin", "tsc");
const TEST_RUNNER = path.join(FRAMEWORK_ROOT, "tests", "run-tests.mjs");
const CLEAN_DIST = path.join(FRAMEWORK_ROOT, "scripts", "clean-dist.mjs");
const SELFTEST_ENVIRONMENT = { ...process.env };
delete SELFTEST_ENVIRONMENT.npm_execpath;

export async function runSelftest() {
  let failures = 0;
  let checks = 0;

  function check(label, condition, detail) {
    checks++;
    if (condition) console.log(`  OK   ${label}`);
    else {
      failures++;
      console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    }
  }

  const examples = path.join(FRAMEWORK_ROOT, "examples", "feature-notion-linear");
  const exampleByType = {
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
  const sandbox = mkdtempSync(path.join(tmpdir(), "arka-norn-selftest-"));
  const pipeline = createPipelineRuntime(FRAMEWORK_ROOT, { homeDir: path.join(sandbox, "audit-home") });
  const typeIds = (await pipeline.listSteps()).map((step) => step.id);

  try {
    console.log("=== 1+2. scaffold pour chaque type : génération + échec attendu uniquement sur sentinelles ===");
    for (const typeId of typeIds) {
      const output = path.join(sandbox, `${typeId}.json`);
      try {
        await pipeline.scaffold({ stepId: typeId, outputPath: output, authorAgentId: "Selftest_validation_20260819" });
        check(`scaffold(${typeId}) ne lève pas d'exception`, true);
      } catch (error) {
        check(`scaffold(${typeId}) ne lève pas d'exception`, false, error instanceof Error ? error.message : String(error));
        continue;
      }
      const result = await pipeline.validate({ filePath: output });
      const noStructuralErrors = result.errors.every((error) => !/required property|additional propert/i.test(error));
      check(`scaffold(${typeId}) échoue uniquement sur ses sentinelles`, !result.valid && noStructuralErrors, JSON.stringify(result.errors));
    }

    console.log("\n=== 3. Chaque exemple réel valide contre le moteur de production ===");
    for (const typeId of typeIds) {
      const filename = exampleByType[typeId];
      if (filename === undefined) {
        check(`exemple déclaré pour ${typeId}`, false, "mapping absent");
        continue;
      }
      const result = await pipeline.validate({ filePath: path.join(examples, filename) });
      check(`${filename} (type ${typeId}) valide`, result.valid, JSON.stringify(result.errors));
    }

    console.log("\n=== 4. Une rupture de contrat est rejetée explicitement ===");
    const concept = loadJson(path.join(examples, "01-concept.json"));
    delete concept.objectif;
    const invalidConcept = path.join(sandbox, "invalid-concept.json");
    writeFileSync(invalidConcept, `${JSON.stringify(concept)}\n`);
    const conceptResult = await pipeline.validate({ filePath: invalidConcept });
    check("retirer 'objectif' du concept échoue en nommant le champ", !conceptResult.valid && conceptResult.errors.some((error) => error.includes("objectif")), JSON.stringify(conceptResult.errors));

    const developmentReport = loadJson(path.join(examples, "09-cr-dev.json"));
    developmentReport.fichiers_livres[0].action = "valeur_inventee";
    const invalidReport = path.join(sandbox, "invalid-cr-dev.json");
    writeFileSync(invalidReport, `${JSON.stringify(developmentReport)}\n`);
    const reportResult = await pipeline.validate({ filePath: invalidReport });
    check("une valeur enum inventée est rejetée", !reportResult.valid, JSON.stringify(reportResult.errors));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  console.log("\n=== 5. status applique le verdict métier de la recette QA ===");
  {
    const result = spawnSync(process.execPath, [BIN, "status", examples], { encoding: "utf8" });
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

  console.log("\n=== 7. Catalogue partagé : skills cohérents, dont Product/FastDev/maîtrise/audit/dev/QA ===");
  {
    const catalog = loadJson(path.join(FRAMEWORK_ROOT, "skills-src", "catalog", "skills.json"));
    const names = catalog.skills.map((skill) => skill.name);
    const definitions = readdirSync(path.join(FRAMEWORK_ROOT, "skills-src")).filter((file) => file.endsWith(".json"));
    check("catalogue sans doublon", new Set(names).size === names.length, names.join(", "));
    check("catalogue couvre chaque définition de skill", names.length === definitions.length, `catalogue ${names.length} vs définitions ${definitions.length}`);
    check("catalogue contient le bootstrap arka-norn", names.includes("arka-norn"), names.join(", "));
    check("catalogue contient le pilotage Product", names.includes("arka-product"), names.join(", "));
    check("catalogue contient FastDev", names.includes("arka-fastdev"), names.join(", "));
    check("catalogue contient maîtrise", names.includes("arka-framework-maitrise"), names.join(", "));
    check("catalogue contient audit", names.includes("arka-framework-audit"), names.join(", "));
    check("catalogue contient dev", names.includes("arka-framework-dev"), names.join(", "));
    check("catalogue contient recette QA", names.includes("arka-framework-recette-qa"), names.join(", "));
    const listed = spawnSync(process.execPath, [BIN, "skills", "list", "--json"], { cwd: FRAMEWORK_ROOT, encoding: "utf8" });
    const listedData = listed.status === 0 ? JSON.parse(listed.stdout).data : [];
    check("CLI skills list consomme le même catalogue", listed.status === 0 && listedData.length === names.length, `${listed.stdout ?? ""}${listed.stderr ?? ""}`);
  }

  console.log("\n=== 8. Intégrité de l'environnement ===");
  const developmentCheckout = existsSync(TSC_BIN) && existsSync(TEST_RUNNER) && existsSync(path.join(FRAMEWORK_ROOT, "src"));
  if (developmentCheckout) {
    runGate("typecheck du code source", [TSC_BIN, "--noEmit"]);
    runGate("typecheck des tests", [TSC_BIN, "-p", path.join(FRAMEWORK_ROOT, "tsconfig.tests.json")]);
    runGate("nettoyage du build précédent", [CLEAN_DIST]);
    runGate("build TypeScript reproductible", [TSC_BIN]);
    runGate("tests TypeScript sans contexte npm injecté", [TEST_RUNNER], { env: SELFTEST_ENVIRONMENT });
  } else {
    check("package de production sans sources TypeScript", !existsSync(path.join(FRAMEWORK_ROOT, "src")));
    check("package de production sans suite de tests interne", !existsSync(TEST_RUNNER));
  }

  console.log(`\n${checks - failures}/${checks} vérifications passées.`);
  if (failures > 0) {
    console.log(`${failures} ÉCHEC(S) — corriger avant usage.`);
    process.exitCode = 1;
  } else {
    console.log("Toutes les vérifications réelles passent.");
    process.exitCode = 0;
  }

  function runGate(label, args, options = {}) {
    const result = spawnSync(process.execPath, args, { cwd: FRAMEWORK_ROOT, encoding: "utf8", ...options });
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    check(label, result.status === 0, detail || `process terminé avec le code ${String(result.status)}`);
  }
}

function loadJson(file) {
  if (!existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runSelftest();
