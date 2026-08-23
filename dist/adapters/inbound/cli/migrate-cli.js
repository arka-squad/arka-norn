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
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { migrateMarkerFile } from "../../outbound/filesystem/marker-migrator.js";
import { migrateLegacyFeatureContract } from "../../outbound/filesystem/legacy-feature-migrator.js";
import { PathSecurityError } from "../../../domain/errors.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
import { jsonEnvelope } from "./cli-envelope.js";
export async function runMigrateCommand(argv, context) {
    const json = argv.includes("--json");
    try {
        const parsed = parseStrictArguments(argv, {
            options: { json: "boolean", apply: "boolean", "dry-run": "boolean", target: "string", project: "string" },
            minPositionals: 0,
            maxPositionals: 0,
            exclusiveGroups: [["apply", "dry-run"]],
        });
        const apply = parsed.booleans.has("apply");
        const target = resolve(context.cwd, parsed.values.get("target") ?? context.cwd);
        const projectId = parsed.values.get("project");
        const results = [];
        for (const candidate of findMarkers(target, 3)) {
            if (candidate.kind === "feature") {
                try {
                    const migration = await migrateLegacyFeatureContract({
                        featureRoot: dirname(dirname(candidate.source)),
                        frameworkRoot: context.frameworkRoot ?? resolve(import.meta.dirname, "..", "..", "..", ".."),
                        apply,
                    });
                    results.push({
                        kind: "feature",
                        source: candidate.source,
                        destination: candidate.source,
                        changed: migration.changed,
                        fromVersion: migration.fromMarkerVersion,
                        toVersion: migration.toMarkerVersion,
                        applied: migration.applied,
                        documentCount: migration.documents.length,
                        ...(migration.markerBackupPath === undefined ? {} : { backupPath: migration.markerBackupPath }),
                    });
                    continue;
                }
                catch (error) {
                    if (!(error instanceof Error) || !error.message.startsWith("Unsupported Feature marker"))
                        throw error;
                }
            }
            const migration = candidate.kind === "project"
                ? await migrateMarkerFile({
                    kind: "project",
                    sourcePath: candidate.source,
                    ...(candidate.destination === undefined ? {} : { destinationPath: candidate.destination }),
                    apply,
                })
                : await migrateMarkerFile({
                    kind: "feature",
                    sourcePath: candidate.source,
                    ...(projectId === undefined ? {} : { projectId }),
                    apply,
                });
            results.push({
                kind: candidate.kind,
                source: candidate.source,
                destination: candidate.destination ?? candidate.source,
                changed: migration.plan.changed,
                fromVersion: migration.plan.fromVersion,
                toVersion: migration.plan.toVersion,
                applied: apply && migration.plan.changed,
                ...(migration.backupPath === undefined ? {} : { backupPath: migration.backupPath }),
            });
        }
        const data = { mode: apply ? "apply" : "dry-run", target, results };
        if (json)
            return { code: 0, stdout: jsonEnvelope({ command: "migrate", ok: true, data }), stderr: "" };
        const rows = results.map((result) => `${result.changed ? (result.applied ? "APPLIED" : "PLANNED") : "CURRENT"}\t${result.source}`);
        return { code: 0, stdout: [`Migration: ${data.mode} (${results.length} marker(s))`, ...rows].join("\n") + "\n", stderr: "" };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof CliUsageError ? 64 : 3;
        return json
            ? { code, stdout: jsonEnvelope({ command: "migrate", ok: false, data: null, errors: [message], errorCode: error instanceof CliUsageError ? "invalid_arguments" : "migration_failed" }), stderr: "" }
            : { code, stdout: "", stderr: `ERROR: ${message}\n` };
    }
}
export function findMarkers(root, depth) {
    if (!existsSync(root))
        throw new Error(`Migration target does not exist: ${root}`);
    const rootStat = lstatSync(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
        throw new Error(`Invalid migration target: ${root}`);
    const found = [];
    walk(root, depth, found);
    return found.sort((left, right) => left.source.localeCompare(right.source));
}
function walk(directory, depth, found) {
    const markerDirectory = join(directory, ".arka-norn");
    if (existsSync(markerDirectory) && lstatSync(markerDirectory).isSymbolicLink()) {
        throw new PathSecurityError(markerDirectory, "symbolic-link marker directories are forbidden");
    }
    const project = join(markerDirectory, "project.json");
    const legacyProject = join(markerDirectory, "depot.json");
    const feature = join(markerDirectory, "feature.json");
    if (existsSync(legacyProject))
        found.push({ kind: "project", source: legacyProject, destination: project });
    else if (existsSync(project))
        found.push({ kind: "project", source: project });
    if (existsSync(feature))
        found.push({ kind: "feature", source: feature });
    if (depth === 0)
        return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === ".arka-norn" || entry.isSymbolicLink())
            continue;
        walk(join(directory, entry.name), depth - 1, found);
    }
}
//# sourceMappingURL=migrate-cli.js.map