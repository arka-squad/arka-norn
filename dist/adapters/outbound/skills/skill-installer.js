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
import { closeSync, copyFileSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync, } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { translate } from "../../../application/localization/locale.js";
import { createSkillCatalogRuntime } from "./skill-catalog.js";
export function installSkills(frameworkRoot, request) {
    const profile = request.profile ?? "all";
    const runtime = createSkillCatalogRuntime(frameworkRoot, profile);
    const target = resolve(request.target);
    const desired = desiredFiles(runtime.definitions, target, (definition) => runtime.renderRepoSkillMd(definition), (definition) => runtime.renderOpenaiYaml(definition));
    if (request.global === true) {
        if (request.globalHome === undefined)
            throw new Error(translate("cli.skills.globalHomeRequired"));
        desired.push(...desiredGlobalFiles(runtime.definitions, resolve(request.globalHome), (definition) => runtime.renderGlobalSkillMd(definition), (definition) => runtime.renderRepoSkillMd(definition), (definition) => runtime.renderOpenaiYaml(definition)));
    }
    const plan = desired.map((item) => ({ ...item, action: classify(item.file, item.content) }));
    const skills = runtime.definitions.map((definition) => definition.name);
    if (plan.some((item) => item.action === "conflict") && request.force !== true) {
        return { ok: false, code: 5, dryRun: request.dryRun === true, profile, skills, plan, error: translate("cli.skills.conflicts") };
    }
    if (request.dryRun === true)
        return { ok: true, code: 0, dryRun: true, profile, skills, plan };
    const applied = [];
    try {
        const stamp = new Date().toISOString().replaceAll(":", "-");
        const changes = plan.filter((item) => item.action !== "unchanged");
        for (const item of changes)
            assertSafeDestination(item.root, item.file);
        for (const item of changes) {
            const backup = item.action === "conflict" ? backupExisting(item.root, item.file, stamp) : undefined;
            writeAtomic(item.file, item.content);
            applied.push({ item, ...(backup === undefined ? {} : { backup }) });
        }
        return { ok: true, code: 0, dryRun: false, profile, skills, plan };
    }
    catch (error) {
        for (const change of applied.reverse()) {
            if (change.backup !== undefined)
                copyFileSync(change.backup, change.item.file);
            else if (existsSync(change.item.file))
                unlinkSync(change.item.file);
        }
        return { ok: false, code: 70, dryRun: false, profile, skills, plan, error: error instanceof Error ? error.message : String(error) };
    }
}
export function inspectSkills(frameworkRoot, target, profile = "all", globalHome) {
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
export function inspectGlobalSkills(frameworkRoot, globalHome, profile = "all") {
    const runtime = createSkillCatalogRuntime(frameworkRoot, profile);
    return runtime.definitions.map((definition) => {
        const expected = desiredGlobalFiles([definition], resolve(globalHome), (item) => runtime.renderGlobalSkillMd(item), (item) => runtime.renderRepoSkillMd(item), (item) => runtime.renderOpenaiYaml(item));
        const files = expected.map((item) => fileStatus(item.file, item.content));
        const status = files.every((file) => file.status === "ok")
            ? "ok"
            : files.some((file) => file.status === "divergent") ? "divergent" : "missing";
        return { name: definition.name, status, files };
    });
}
export function findOrphanSkills(frameworkRoot, target, profile = "all", globalHome) {
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
    const orphans = [];
    for (const location of locations) {
        if (!existsSync(location))
            continue;
        for (const entry of readdirSync(location, { withFileTypes: true })) {
            if (entry.name.startsWith("arka-") && !managed.has(entry.name))
                orphans.push({ name: entry.name, location });
        }
    }
    return orphans.sort((a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location));
}
function desiredGlobalFiles(definitions, globalHome, renderClaude, renderCodex, renderOpenai) {
    return definitions.flatMap((definition) => [
        { root: globalHome, file: join(globalHome, ".claude", "skills", definition.name, "SKILL.md"), content: renderClaude(definition) },
        { root: globalHome, file: join(globalHome, ".codex", "skills", definition.name, "SKILL.md"), content: renderCodex(definition) },
        { root: globalHome, file: join(globalHome, ".codex", "skills", definition.name, "agents", "openai.yaml"), content: renderOpenai(definition) },
    ]);
}
function desiredFiles(definitions, target, renderRepo, renderOpenai) {
    return definitions.flatMap((definition) => [
        { root: target, file: join(target, ".claude", "skills", definition.name, "SKILL.md"), content: renderRepo(definition) },
        { root: target, file: join(target, ".agents", "skills", definition.name, "SKILL.md"), content: renderRepo(definition) },
        { root: target, file: join(target, ".agents", "skills", definition.name, "agents", "openai.yaml"), content: renderOpenai(definition) },
    ]);
}
function classify(file, content) {
    if (!existsSync(file))
        return "create";
    if (lstatSync(file).isSymbolicLink())
        return "conflict";
    return readFileSync(file, "utf8") === content ? "unchanged" : "conflict";
}
function fileStatus(file, expected) {
    const expectedChecksum = digest(expected);
    if (!existsSync(file))
        return { file, status: "missing", expectedChecksum };
    if (lstatSync(file).isSymbolicLink())
        return { file, status: "divergent", expectedChecksum, reason: "symlink" };
    const actualChecksum = digest(readFileSync(file));
    return { file, status: actualChecksum === expectedChecksum ? "ok" : "divergent", expectedChecksum, actualChecksum };
}
function assertSafeDestination(root, file) {
    const absoluteRoot = resolve(root);
    if (!existsSync(absoluteRoot))
        mkdirSync(absoluteRoot, { recursive: true, mode: 0o700 });
    if (lstatSync(absoluteRoot).isSymbolicLink())
        throw new Error(translate("cli.skills.symlinkRoot", { path: absoluteRoot }));
    const canonicalRoot = realpathSync(absoluteRoot);
    const relation = relative(absoluteRoot, resolve(file));
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation))
        throw new Error(`Sortie hors cible : ${file}`);
    const canonicalFile = resolve(canonicalRoot, relation);
    const canonicalRelation = relative(canonicalRoot, canonicalFile);
    if (canonicalRelation === ".." || canonicalRelation.startsWith(`..${sep}`) || isAbsolute(canonicalRelation))
        throw new Error(`Sortie hors cible : ${file}`);
    let cursor = dirname(file);
    const pending = [];
    while (!existsSync(cursor)) {
        pending.push(cursor);
        cursor = dirname(cursor);
    }
    while (true) {
        if (lstatSync(cursor).isSymbolicLink())
            throw new Error(translate("cli.skills.symlinkComponent", { path: cursor }));
        if (resolve(cursor) === absoluteRoot)
            break;
        const parent = dirname(cursor);
        if (parent === cursor)
            throw new Error(translate("cli.skills.unconfined", { path: file }));
        cursor = parent;
    }
    for (const directory of pending.reverse())
        mkdirSync(directory, { mode: 0o700 });
    if (existsSync(file) && lstatSync(file).isSymbolicLink())
        throw new Error(translate("cli.skills.symlinkFile", { path: file }));
}
function backupExisting(root, file, stamp) {
    const backup = join(resolve(root), ".arka-norn", "backups", "skills", stamp, relative(resolve(root), resolve(file)));
    mkdirSync(dirname(backup), { recursive: true, mode: 0o700 });
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
    }
    catch (error) {
        if (descriptor !== undefined)
            closeSync(descriptor);
        if (existsSync(temporary))
            unlinkSync(temporary);
        throw error;
    }
}
function digest(value) {
    return createHash("sha256").update(value).digest("hex");
}
//# sourceMappingURL=skill-installer.js.map