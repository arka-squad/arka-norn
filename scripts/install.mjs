#!/usr/bin/env node
// Sous-commande CLI : arka-norn install [--global] [--target <repo_root>]
// Compile skills-src/*.json (source UNIQUE de chaque skill) vers les formats réels
// attendus par chaque provider, et les écrit aux emplacements réels lus par les
// agents de dev (vérifiés contre crates/arka-factory-core/src/skill_deploy.rs du
// dépôt Skills-factory/arka-factory) :
//   <target>/.claude/skills/<name>/SKILL.md             (Claude Code)
//   <target>/.agents/skills/<name>/SKILL.md              (Codex CLI + Antigravity, partagé)
//   <target>/.agents/skills/<name>/agents/openai.yaml    (annexe Codex)
//   ~/.claude/skills/<name>/SKILL.md                     (scope global, si --global)
// N'écrit RIEN dans le système Skills-factory (pas de compilation via son pipeline
// applicatif) : ce compilateur est autonome et propre à arka-norn.
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { FRAMEWORK_ROOT } from "./lib.mjs";

// arka-norn est un outil central (installé une fois, lié globalement via
// `npm link`, commande `arka-norn` dans le PATH) -- PAS copié dans chaque
// dépôt où on l'utilise. Deux placeholders distincts dans skills-src/*.json :
//  - {{FRAMEWORK_NAME}} -> nom du produit ("arka-norn"), pour les phrases
//    narratives ("le framework méthodologique X").
//  - {{FRAMEWORK_DIR}}  -> référence portable résolue depuis le package npm
//    global, sans chemin absolu propre à la machine qui fabrique le skill.
// Les COMMANDES elles-mêmes n'utilisent jamais ces placeholders : elles
// appellent directement la commande globale `arka-norn`, valide depuis
// n'importe quel dépôt une fois le lien npm en place.
const FRAMEWORK_NAME = path.basename(FRAMEWORK_ROOT);
const FRAMEWORK_REFERENCE = "$(npm root -g)/arka-norn";
const SKILLS_SRC_DIR = path.join(FRAMEWORK_ROOT, "skills-src");
const CATALOG_PATH = path.join(SKILLS_SRC_DIR, "catalog", "skills.json");

function substitute(text) {
  return text.replaceAll("{{FRAMEWORK_NAME}}", FRAMEWORK_NAME).replaceAll("{{FRAMEWORK_DIR}}", FRAMEWORK_REFERENCE);
}

export function loadCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

export function loadSkillDefs(profile = "all") {
  const catalog = loadCatalog();
  if (!Object.hasOwn(catalog.profiles, profile)) throw new Error(`Profil inconnu : ${profile}`);
  return catalog.skills.filter((entry) => entry.profiles.includes(profile)).map((entry) => {
    const raw = readFileSync(path.join(SKILLS_SRC_DIR, entry.source));
    const checksum = createHash("sha256").update(raw).digest("hex");
    if (checksum !== entry.checksum) throw new Error(`Checksum source invalide pour ${entry.name}`);
    const definition = JSON.parse(raw.toString("utf8"));
    if (definition.name !== entry.name) throw new Error(`Nom de catalogue incohérent : ${entry.name}`);
    return { ...definition, catalog: entry };
  });
}

function wrapYamlBlock(text, indent = "  ", width = 78) {
  const words = substitute(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else {
      line = `${line} ${w}`.trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines.map((l) => `${indent}${l}`).join("\n");
}

function renderBody(def) {
  const quandUtiliser = def.quand_utiliser.map((l) => `- ${substitute(l)}`).join("\n");
  const quandNePas = def.quand_ne_pas_utiliser.map((l) => `- ${substitute(l)}`).join("\n");
  const inputsLines = def.inputs
    .map((i) => `- **${i.obligatoire ? "Obligatoire" : "Optionnel"}** : \`${i.nom}\` — ${substitute(i.description)}`)
    .join("\n");
  const noteInputs = def.note_inputs ? `\n\n${substitute(def.note_inputs)}` : "";
  const referentielIntro = `Ce skill pilote ${FRAMEWORK_NAME}, disponible via la commande globale \`${FRAMEWORK_NAME}\`. Les références du package se résolvent avec \`${FRAMEWORK_REFERENCE}\`. Si cette commande est absente du PATH, ce skill ne s'applique pas.`;
  const referentielExtra = def.referentiel_extra.length
    ? "\n\n" + def.referentiel_extra.map((l) => `- ${substitute(l)}`).join("\n")
    : "";
  const procedure = def.procedure
    .map((p, i) => `### step_${i + 1} — ${substitute(p.titre)}\n\n${substitute(p.contenu)}`)
    .join("\n\n");

  return `## Quand utiliser cette skill

${quandUtiliser}

## Quand NE PAS utiliser

${quandNePas}

## Inputs attendus

${inputsLines}${noteInputs}

## Référentiel mobilisé

${referentielIntro}${referentielExtra}

## Procédure

${procedure}

## Format de sortie

${substitute(def.format_sortie)}
`;
}

export function renderRepoSkillMd(def) {
  const desc = `${substitute(def.description_courte)} ${def.description_do_use} ${def.description_do_not_use}`;
  return `---
name: ${def.name}
description: ${desc}
---

# ${def.titre_h1_repo}

${substitute(def.description_courte)}

${renderBody(def)}`;
}

export function renderGlobalSkillMd(def) {
  const toolsYaml = def.allowed_tools.map((t) => `  - ${t}`).join("\n");
  return `---
name: ${def.name}
version: 1.0.0
description: |
${wrapYamlBlock(def.declencheurs_globaux)}
compatibility: claude-code opencode claude-ai
allowed-tools:
${toolsYaml}
---

# ${def.titre_h1_global}

${substitute(def.description_courte)}

${renderBody(def)}`;
}

export function renderOpenaiYaml(def) {
  const shortDesc = substitute(def.description_courte).replaceAll('"', '\\"');
  return `interface:
  display_name: "Arka — ${def.name}"
  short_description: "${shortDesc}"
  default_prompt: "Utilise $${def.name} pour exécuter cette étape avec les gates arka-norn."

policy:
  allow_implicit_invocation: true
`;
}

export function runInstall(argv, runtime = {}) {
  const global = argv.includes("--global");
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const json = argv.includes("--json");
  const targetIdx = argv.indexOf("--target");
  const profileIdx = argv.indexOf("--profile");
  const profile = profileIdx === -1 ? "all" : argv[profileIdx + 1];
  // Défaut = dossier courant (cwd), PAS un chemin lié à où vit arka-norn
  // lui-même (installé une fois, ailleurs, indépendant du dépôt cible).
  // Comportement standard d'un outil CLI global : agir sur le cwd sauf
  // --target explicite.
  const targetRoot = targetIdx !== -1 && argv[targetIdx + 1] ? path.resolve(argv[targetIdx + 1]) : process.cwd();
  const allowed = new Set(["--global", "--dry-run", "--force", "--json", "--target", "--profile"]);
  const unknown = argv.filter((value, index) => !allowed.has(value) && argv[index - 1] !== "--target" && argv[index - 1] !== "--profile");
  if (unknown.length > 0 || (targetIdx !== -1 && !argv[targetIdx + 1]) || (profileIdx !== -1 && !argv[profileIdx + 1])) {
    console.error("Usage : arka-norn install [--target <repo>] [--global] [--profile all|core|delivery] [--dry-run] [--force] [--json]");
    process.exitCode = 64;
    return;
  }

  let defs;
  try {
    defs = loadSkillDefs(profile);
  } catch (error) {
    console.error(`ERREUR — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 64;
    return;
  }
  if (defs.length === 0) {
    console.error(`ERREUR — aucun skill trouvé dans ${SKILLS_SRC_DIR}`);
    process.exit(1);
  }

  const desired = [];

  for (const def of defs) {
    const repoMd = renderRepoSkillMd(def);
    desired.push(
      { root: targetRoot, file: path.join(targetRoot, ".claude", "skills", def.name, "SKILL.md"), content: repoMd },
      { root: targetRoot, file: path.join(targetRoot, ".agents", "skills", def.name, "SKILL.md"), content: repoMd },
      { root: targetRoot, file: path.join(targetRoot, ".agents", "skills", def.name, "agents", "openai.yaml"), content: renderOpenaiYaml(def) },
    );

    if (global) {
      const home = path.resolve(os.homedir());
      desired.push({ root: home, file: path.join(home, ".claude", "skills", def.name, "SKILL.md"), content: renderGlobalSkillMd(def) });
    }
  }

  const plan = desired.map((item) => ({ ...item, action: classify(item.file, item.content) }));
  const conflicts = plan.filter((item) => item.action === "conflict");
  if (conflicts.length > 0 && !force) {
    const result = { ok: false, code: 5, dryRun, profile, skills: defs.map((def) => def.name), plan, error: "Conflits locaux détectés ; utilise --force pour sauvegarder puis remplacer." };
    if (!runtime.silent) presentInstallResult(result, json);
    if (!runtime.embedded) process.exitCode = 5;
    return result;
  }

  if (!dryRun) {
    const applied = [];
    try {
      const stamp = new Date().toISOString().replaceAll(":", "-");
      const changes = plan.filter((item) => item.action !== "unchanged");
      for (const item of changes) assertSafeDestination(item.root, item.file);
      for (const item of changes) {
        const backup = item.action === "conflict" ? backupExisting(item.root, item.file, stamp) : undefined;
        writeAtomic(item.file, item.content);
        applied.push({ item, backup });
      }
    } catch (error) {
      for (const change of applied.reverse()) {
        if (change.backup) copyFileSync(change.backup, change.item.file);
        else if (existsSync(change.item.file)) unlinkSync(change.item.file);
      }
      const result = { ok: false, code: 70, dryRun, profile, skills: defs.map((def) => def.name), plan, error: error instanceof Error ? error.message : String(error) };
      if (!runtime.silent) presentInstallResult(result, json);
      if (!runtime.embedded) process.exitCode = 70;
      return result;
    }
  }
  const result = { ok: true, code: 0, dryRun, profile, skills: defs.map((def) => def.name), plan };
  if (!runtime.silent) presentInstallResult(result, json);
  if (!runtime.embedded) process.exitCode = 0;
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) runInstall(process.argv.slice(2));

function classify(file, content) {
  if (!existsSync(file)) return "create";
  if (lstatSync(file).isSymbolicLink()) return "conflict";
  return readFileSync(file, "utf8") === content ? "unchanged" : "conflict";
}

function assertSafeDestination(root, file) {
  const absoluteRoot = path.resolve(root);
  if (!existsSync(absoluteRoot)) mkdirSync(absoluteRoot, { recursive: true, mode: 0o700 });
  if (lstatSync(absoluteRoot).isSymbolicLink()) throw new Error(`Cible symbolique refusée : ${absoluteRoot}`);
  const canonicalRoot = realpathSync(absoluteRoot);
  const relation = path.relative(absoluteRoot, path.resolve(file));
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw new Error(`Sortie hors cible : ${file}`);
  const canonicalFile = path.resolve(canonicalRoot, relation);
  const canonicalRelation = path.relative(canonicalRoot, canonicalFile);
  if (canonicalRelation === ".." || canonicalRelation.startsWith(`..${path.sep}`) || path.isAbsolute(canonicalRelation)) throw new Error(`Sortie hors cible : ${file}`);
  let cursor = path.dirname(file);
  const pending = [];
  while (!existsSync(cursor)) {
    pending.push(cursor);
    cursor = path.dirname(cursor);
  }
  while (true) {
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Composant symbolique refusé : ${cursor}`);
    if (path.resolve(cursor) === path.resolve(absoluteRoot)) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`Cible non confinée : ${file}`);
    cursor = parent;
  }
  for (const directory of pending.reverse()) mkdirSync(directory, { mode: 0o700 });
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error(`Fichier symbolique refusé : ${file}`);
}

function backupExisting(root, file, stamp) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  const backup = path.join(path.resolve(root), ".arka-norn", "backups", "skills", stamp, relative);
  mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
  copyFileSync(file, backup, 1);
  return backup;
}

function writeAtomic(file, content) {
  const temporary = `${file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, content, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function presentInstallResult(result, json) {
  const publicPlan = result.plan.map(({ file, action }) => ({ file, action }));
  if (json) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "skills.install", ok: result.ok, data: { dryRun: result.dryRun, profile: result.profile, skills: result.skills, plan: publicPlan }, errors: result.error ? [result.error] : [], warnings: [] })}\n`);
    return;
  }
  console.log(`${result.dryRun ? "Plan" : "Installation"} — ${result.skills.length} skill(s), profil ${result.profile}`);
  for (const item of publicPlan) console.log(`  ${item.action.padEnd(9)} ${item.file}`);
  if (result.error) console.error(`ERREUR — ${result.error}`);
}
