import * as fs from "node:fs/promises";
import { join } from "node:path";

import type { DoctorIndexInspector, IndexInspection } from "../../../ports/outbound/doctor-index-inspector.js";
import { readRaw, writeJsonAtomic } from "./_shared/atomic-json.js";

export class FsDoctor implements DoctorIndexInspector {
  private readonly home: string;

  public constructor(homeDir: string) {
    this.home = homeDir;
  }

  public async inspectIndex(kind: "projects" | "features", repair: boolean, apply: boolean): Promise<IndexInspection> {
    const target = join(this.home, ".arka-norn", "index", `${kind}.json`);
    let raw: string | undefined;
    try {
      raw = await readRaw(target);
    } catch (error) {
      return this.invalidIndex(kind, target, error instanceof Error ? error.message : String(error), repair, apply);
    }
    if (raw === undefined) {
      return { check: { id: `index.${kind}`, status: "warn", message: "index absent; it will be created on first use", repairable: false } };
    }
    try {
      const value = JSON.parse(raw) as unknown;
      if (!isIndex(value)) return this.invalidIndex(kind, target, "schema invalid", repair, apply);
      const mode = (await fs.stat(target)).mode & 0o777;
      if (mode !== 0o600) {
        if (repair && apply) await fs.chmod(target, 0o600);
        return {
          check: { id: `index.${kind}`, status: repair && apply ? "pass" : "warn", message: repair && apply ? "permissions repaired to 0600" : `permissions are ${mode.toString(8)} instead of 600`, repairable: true },
          ...(repair ? { repair: { target, action: "chmod_0600", applied: apply } as const } : {}),
        };
      }
      return { check: { id: `index.${kind}`, status: "pass", message: "index valid and private", repairable: false } };
    } catch (error) {
      return this.invalidIndex(kind, target, error instanceof Error ? error.message : String(error), repair, apply);
    }
  }

  private async invalidIndex(kind: string, target: string, reason: string, repair: boolean, apply: boolean): Promise<IndexInspection> {
    let backupPath: string | undefined;
    if (repair && apply) {
      const backupDir = join(this.home, ".arka-norn", "backups");
      await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
      backupPath = join(backupDir, `${kind}-${Date.now()}-corrupt.json`);
      await fs.copyFile(target, backupPath, fs.constants.COPYFILE_EXCL);
      await fs.chmod(backupPath, 0o600);
      await writeJsonAtomic(target, { schemaVersion: 2, entries: [] }, { mode: 0o600 });
    }
    return {
      check: {
        id: `index.${kind}`,
        status: repair && apply ? "pass" : "fail",
        message: repair && apply ? `corrupt index isolated and reset (${reason})` : `corrupt index (${reason})`,
        repairable: true,
      },
      ...(repair ? { repair: { target, action: "backup_and_reset", applied: apply, ...(backupPath === undefined ? {} : { backupPath }) } } : {}),
    };
  }
}

function isIndex(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Readonly<Record<string, unknown>>;
  return candidate["schemaVersion"] === 2 && Array.isArray(candidate["entries"]);
}
