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
import * as fs from "node:fs/promises";
import { dirname } from "node:path";
import { planFeatureMarkerMigration, planProjectMarkerMigration, } from "../../../domain/shared/marker-formats.js";
import { PathSecurityError } from "../../../domain/errors.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
export async function migrateMarkerFile(request) {
    await assertRegularParentDirectory(request.sourcePath);
    const value = await readJson(request.sourcePath);
    if (value === undefined) {
        throw new Error(`Marker not found: "${request.sourcePath}"`);
    }
    const plan = request.kind === "project"
        ? planProjectMarkerMigration(value)
        : planFeatureMarkerMigration(value, { ...(request.projectId !== undefined ? { projectId: request.projectId } : {}) });
    if (!plan.changed || request.apply !== true)
        return { plan };
    const destinationPath = request.destinationPath ?? request.sourcePath;
    await assertRegularParentDirectory(destinationPath);
    const backupPath = `${request.sourcePath}.v${plan.fromVersion}.bak`;
    await createBackupOnce(request.sourcePath, backupPath);
    await writeJsonAtomic(destinationPath, plan.output);
    return { plan, backupPath };
}
async function assertRegularParentDirectory(filePath) {
    const parent = dirname(filePath);
    if ((await fs.lstat(parent)).isSymbolicLink()) {
        throw new PathSecurityError(parent, "symbolic-link marker directories are forbidden");
    }
}
async function createBackupOnce(sourcePath, backupPath) {
    try {
        await fs.copyFile(sourcePath, backupPath, fs.constants.COPYFILE_EXCL);
    }
    catch (error) {
        if (!isAlreadyExists(error))
            throw error;
    }
}
function isAlreadyExists(error) {
    return error instanceof Error && "code" in error && error.code === "EEXIST";
}
//# sourceMappingURL=marker-migrator.js.map