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

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { createSkillCatalogRuntime, type SkillDefinition } from "./skill-catalog.js";

export type SkillPlanAction = "create" | "unchanged" | "conflict";

export interface SkillPlanItem {
  readonly root: string;
  readonly file: string;
  readonly content: string;
  readonly action: SkillPlanAction;
}

export interface SkillInstallRequest {
  readonly target: string;
  readonly profile?: string;
  readonly global?: boolean;
  readonly globalHome?: string;
  readonly dryRun?: boolean;
  readonly force?: boolean;
}

export interface SkillInstallOutcome {
  readonly ok: boolean;
  readonly code: number;
  readonly dryRun: boolean;
  readonly profile: string;
  readonly skills: readonly string[];
  readonly plan: readonly SkillPlanItem[];
  readonly error?: string;
}

export interface SkillFileHealth {
  readonly file: string;
  readonly status: "ok" | "missing" | "divergent";
  readonly expectedChecksum: string;
  readonly actualChecksum?: string;
  readonly reason?: string;
}

export interface SkillDefinitionHealth {
  readonly name: string;
  readonly status: "ok" | "missing" | "divergent";
  readonly files: readonly SkillFileHealth[];
}

export interface SkillOrphanEntry {
  readonly name: string;
  readonly location: string;
}

export function installSkills(frameworkRoot: string, request: SkillInstallRequest): SkillInstallOutcome {
  const profile = request.profile ?? "all";
  const runtime = createSkillCatalogRuntime(frameworkRoot, profile);
  const target = resolve(request.target);
  const desired = desiredFiles(runtime.definitions, target, (definition) => runtime.renderRepoSkillMd(definition), (definition) => runtime.renderOpenaiYaml(definition));
  if (request.global === true) {
    if (request.globalHome === undefined) throw new Error("Le home global doit être explicite pour une installation globale");
    desired.push(...desiredGlobalFiles(runtime.definitions, resolve(request.globalHome), (definition) => runtime.renderGlobalSkillMd(definition), (definition) => runtime.renderRepoSkillMd(definition), (definition) => runtime.renderOpenaiYaml(definition)));
  }
  const plan = desired.map((item) => ({ ...item, action: classify(item.file, item.content) }));
  const skills = runtime.definitions.map((definition) => definition.name);
  if (plan.some((item) => item.action === "conflict") && request.force !== true) {
    return { ok: false, code: 5, dryRun: request.dryRun === true, profile, skills, plan, error: "Conflits locaux détectés ; utilise --force pour sauvegarder puis remplacer." };
  }
  if (request.dryRun === true) return { ok: true, code: 0, dryRun: true, profile, skills, plan };

  const applied: { readonly item: SkillPlanItem; readonly backup?: string }[] = [];
  try {
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const changes = plan.filter((item) => item.action !== "unchanged");
    for (const item of changes) assertSafeDestination(item.root, item.file);
    for (const item of changes) {
      const backup = item.action === "conflict" ? backupExisting(item.root, item.file, stamp) : undefined;
      writeAtomic(item.file, item.content);
      applied.push({ item, ...(backup === undefined ? {} : { backup }) });
    }
    return { ok: true, code: 0, dryRun: false, profile, skills, plan };
  } catch (error) {
    for (const change of applied.reverse()) {
      if (change.backup !== undefined) copyFileSync(change.backup, change.item.file);
      else if (existsSync(change.item.file)) unlinkSync(change.item.file);
    }
    return { ok: false, code: 70, dryRun: false, profile, skills, plan, error: error instanceof Error ? error.message : String(error) };
  }
}

export function inspectSkills(frameworkRoot: string, target: string, profile = "all", globalHome?: string): readonly SkillDefinitionHealth[] {
  const runtime = createSkillCatalogRuntime(frameworkRoot, profile);
  return runtime.definitions.map((definition) => {
    const expected = desiredFiles([definition], resolve(target), (item) => runtime.renderRepoSkillMd(item), (item) => runtime.renderOpenaiYaml(item));
    if (globalHome !== undefined) {
      expected.push(...desiredGlobalFiles([definition], resolve(globalHome), (item) => runtime.renderGlobalSkillMd(item), (item) => runtime.renderRepoSkillMd(item), (item) => runtime.renderOpenaiYaml(item)));
    }
    const files = expected.map((item) => fileStatus(item.file, item.content));
    const status = files.every((file) => file.status === "ok")
      ? "ok"
      : files.some((file) => file.status === "divergent") ? "divergent" : "missing";
    return { name: definition.name, status, files };
  });
}

/**
 * Inspecte uniquement les artefacts d'entrée utilisateur Claude/Codex.
 * Cette vue séparée évite qu'une copie locale saine masque un point d'entrée
 * global obsolète dans la TUI.
 */
export function inspectGlobalSkills(frameworkRoot: string, globalHome: string, profile = "all"): readonly SkillDefinitionHealth[] {
  const runtime = createSkillCatalogRuntime(frameworkRoot, profile);
  return runtime.definitions.map((definition) => {
    const expected = desiredGlobalFiles(
      [definition],
      resolve(globalHome),
      (item) => runtime.renderGlobalSkillMd(item),
      (item) => runtime.renderRepoSkillMd(item),
      (item) => runtime.renderOpenaiYaml(item),
    );
    const files = expected.map((item) => fileStatus(item.file, item.content));
    const status = files.every((file) => file.status === "ok")
      ? "ok"
      : files.some((file) => file.status === "divergent") ? "divergent" : "missing";
    return { name: definition.name, status, files };
  });
}

/**
 * Détecte les entrées `arka-*` présentes dans un emplacement de skills mais
 * absentes du catalogue. Ces copies non gérées ne peuvent pas être comparées à
 * une référence : elles sont signalées, jamais modifiées ici.
 */
export function findOrphanSkills(
  frameworkRoot: string,
  target: string,
  profile = "all",
  globalHome?: string,
): readonly SkillOrphanEntry[] {
  const catalog = createSkillCatalogRuntime(frameworkRoot, profile);
  const managed = new Set(catalog.catalog.skills.map((entry) => entry.name));
  const locations = [
    join(resolve(target), ".claude", "skills"),
    join(resolve(target), ".agents", "skills"),
    ...(globalHome === undefined ? [] : [
      join(resolve(globalHome), ".claude", "skills"),
      join(resolve(globalHome), ".codex", "skills"),
    ]),
  ];
  const orphans: SkillOrphanEntry[] = [];
  for (const location of locations) {
    if (!existsSync(location)) continue;
    for (const entry of readdirSync(location, { withFileTypes: true })) {
      if (entry.name.startsWith("arka-") && !managed.has(entry.name)) orphans.push({ name: entry.name, location });
    }
  }
  return orphans.sort((a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location));
}

function desiredGlobalFiles(
  definitions: readonly SkillDefinition[],
  globalHome: string,
  renderClaude: (definition: SkillDefinition) => string,
  renderCodex: (definition: SkillDefinition) => string,
  renderOpenai: (definition: SkillDefinition) => string,
): { readonly root: string; readonly file: string; readonly content: string }[] {
  return definitions.flatMap((definition) => [
    { root: globalHome, file: join(globalHome, ".claude", "skills", definition.name, "SKILL.md"), content: renderClaude(definition) },
    { root: globalHome, file: join(globalHome, ".codex", "skills", definition.name, "SKILL.md"), content: renderCodex(definition) },
    { root: globalHome, file: join(globalHome, ".codex", "skills", definition.name, "agents", "openai.yaml"), content: renderOpenai(definition) },
  ]);
}

function desiredFiles(
  definitions: readonly SkillDefinition[],
  target: string,
  renderRepo: (definition: SkillDefinition) => string,
  renderOpenai: (definition: SkillDefinition) => string,
): { readonly root: string; readonly file: string; readonly content: string }[] {
  return definitions.flatMap((definition) => [
    { root: target, file: join(target, ".claude", "skills", definition.name, "SKILL.md"), content: renderRepo(definition) },
    { root: target, file: join(target, ".agents", "skills", definition.name, "SKILL.md"), content: renderRepo(definition) },
    { root: target, file: join(target, ".agents", "skills", definition.name, "agents", "openai.yaml"), content: renderOpenai(definition) },
  ]);
}

function classify(file: string, content: string): SkillPlanAction {
  if (!existsSync(file)) return "create";
  if (lstatSync(file).isSymbolicLink()) return "conflict";
  return readFileSync(file, "utf8") === content ? "unchanged" : "conflict";
}

function fileStatus(file: string, expected: string): SkillFileHealth {
  const expectedChecksum = digest(expected);
  if (!existsSync(file)) return { file, status: "missing", expectedChecksum };
  if (lstatSync(file).isSymbolicLink()) return { file, status: "divergent", expectedChecksum, reason: "symlink" };
  const actualChecksum = digest(readFileSync(file));
  return { file, status: actualChecksum === expectedChecksum ? "ok" : "divergent", expectedChecksum, actualChecksum };
}

function assertSafeDestination(root: string, file: string): void {
  const absoluteRoot = resolve(root);
  if (!existsSync(absoluteRoot)) mkdirSync(absoluteRoot, { recursive: true, mode: 0o700 });
  if (lstatSync(absoluteRoot).isSymbolicLink()) throw new Error(`Cible symbolique refusée : ${absoluteRoot}`);
  const canonicalRoot = realpathSync(absoluteRoot);
  const relation = relative(absoluteRoot, resolve(file));
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error(`Sortie hors cible : ${file}`);
  const canonicalFile = resolve(canonicalRoot, relation);
  const canonicalRelation = relative(canonicalRoot, canonicalFile);
  if (canonicalRelation === ".." || canonicalRelation.startsWith(`..${sep}`) || isAbsolute(canonicalRelation)) throw new Error(`Sortie hors cible : ${file}`);
  let cursor = dirname(file);
  const pending: string[] = [];
  while (!existsSync(cursor)) {
    pending.push(cursor);
    cursor = dirname(cursor);
  }
  while (true) {
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Composant symbolique refusé : ${cursor}`);
    if (resolve(cursor) === absoluteRoot) break;
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`Cible non confinée : ${file}`);
    cursor = parent;
  }
  for (const directory of pending.reverse()) mkdirSync(directory, { mode: 0o700 });
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error(`Fichier symbolique refusé : ${file}`);
}

function backupExisting(root: string, file: string, stamp: string): string {
  const backup = join(resolve(root), ".arka-norn", "backups", "skills", stamp, relative(resolve(root), resolve(file)));
  mkdirSync(dirname(backup), { recursive: true, mode: 0o700 });
  copyFileSync(file, backup, 1);
  return backup;
}

function writeAtomic(file: string, content: string): void {
  const temporary = `${file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  let descriptor: number | undefined;
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

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
