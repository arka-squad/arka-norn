import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { migrateMarkerFile } from "../../outbound/filesystem/marker-migrator.js";
import { PathSecurityError } from "../../../domain/errors.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
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
            return { code: 0, stdout: `${JSON.stringify({ schemaVersion: 1, command: "migrate", ok: true, data, errors: [], warnings: [] })}\n`, stderr: "" };
        const rows = results.map((result) => `${result.changed ? (result.applied ? "APPLIED" : "PLANNED") : "CURRENT"}\t${result.source}`);
        return { code: 0, stdout: [`Migration — ${data.mode} — ${results.length} marker(s)`, ...rows].join("\n") + "\n", stderr: "" };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof CliUsageError ? 64 : 3;
        return json
            ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command: "migrate", ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
            : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
    }
}
export function findMarkers(root, depth) {
    if (!existsSync(root))
        throw new Error(`Cible de migration inexistante : ${root}`);
    const rootStat = lstatSync(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
        throw new Error(`Cible de migration invalide : ${root}`);
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