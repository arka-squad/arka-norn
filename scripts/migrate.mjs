import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrateMarkerFile } from "../dist/adapters/outbound/filesystem/marker-migrator.js";

export async function runMigrate(argv) {
  const json = argv.includes("--json");
  const apply = argv.includes("--apply");
  const targetIndex = argv.indexOf("--target");
  const projectIndex = argv.indexOf("--project");
  const allowed = new Set(["--json", "--apply", "--dry-run", "--target", "--project"]);
  const unknown = argv.filter((value, index) => !allowed.has(value) && argv[index - 1] !== "--target" && argv[index - 1] !== "--project");
  if (unknown.length > 0 || (targetIndex !== -1 && !argv[targetIndex + 1]) || (projectIndex !== -1 && !argv[projectIndex + 1])) {
    return usage("migrate [--target <path>] [--project <project-id>] [--dry-run|--apply] [--json]");
  }
  const target = path.resolve(targetIndex === -1 ? process.cwd() : argv[targetIndex + 1]);
  try {
    const candidates = findMarkers(target, 3);
    const results = [];
    for (const candidate of candidates) {
      const result = await migrateMarkerFile(candidate.kind === "project"
        ? { kind: "project", sourcePath: candidate.source, destinationPath: candidate.destination, apply }
        : { kind: "feature", sourcePath: candidate.source, ...(projectIndex === -1 ? {} : { projectId: argv[projectIndex + 1] }), apply });
      results.push({ kind: candidate.kind, source: candidate.source, destination: candidate.destination ?? candidate.source, changed: result.plan.changed, fromVersion: result.plan.fromVersion, toVersion: result.plan.toVersion, applied: apply && result.plan.changed, ...(result.backupPath ? { backupPath: result.backupPath } : {}) });
    }
    const data = { mode: apply ? "apply" : "dry-run", target, results };
    if (json) process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "migrate", ok: true, data, errors: [], warnings: [] })}\n`);
    else {
      console.log(`Migration — ${data.mode} — ${results.length} marker(s)`);
      for (const result of results) console.log(`${result.changed ? (result.applied ? "APPLIED" : "PLANNED") : "CURRENT"}\t${result.source}`);
    }
    process.exitCode = 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "migrate", ok: false, data: null, errors: [message], warnings: [] })}\n`);
    else console.error(`ERREUR — ${message}`);
    process.exitCode = 3;
  }
}

function findMarkers(root, depth) {
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error(`Cible de migration invalide : ${root}`);
  const found = [];
  walk(root, depth, found);
  return found.sort((left, right) => left.source.localeCompare(right.source));
}

function walk(directory, depth, found) {
  const markerDir = path.join(directory, ".arka-norn");
  const project = path.join(markerDir, "project.json");
  const legacyProject = path.join(markerDir, "depot.json");
  const feature = path.join(markerDir, "feature.json");
  if (existsSync(legacyProject)) found.push({ kind: "project", source: legacyProject, destination: project });
  else if (existsSync(project)) found.push({ kind: "project", source: project });
  if (existsSync(feature)) found.push({ kind: "feature", source: feature });
  if (depth === 0) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".arka-norn" || entry.isSymbolicLink()) continue;
    walk(path.join(directory, entry.name), depth - 1, found);
  }
}

function usage(value) {
  console.error(`Usage : arka-norn ${value}`);
  process.exitCode = 64;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) await runMigrate(process.argv.slice(2));
