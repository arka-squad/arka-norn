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

import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { PathSecurityError } from "../../../domain/errors.js";
import type { AuditEvent, AuditTrail, AuditTrailHealth } from "../../../ports/outbound/audit-trail.js";
import { withFileLock } from "./_shared/file-lock.js";

export class FsAuditTrail implements AuditTrail {
  private readonly homeDir: string;
  private readonly stateDir: string;
  private readonly logDir: string;
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxArchives: number;

  public constructor(homeDir: string = homedir(), options: { readonly maxBytes?: number; readonly maxArchives?: number } = {}) {
    this.homeDir = homeDir;
    this.stateDir = join(homeDir, ".arka-norn");
    this.logDir = join(this.stateDir, "logs");
    this.filePath = join(this.logDir, "audit.jsonl");
    this.maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
    this.maxArchives = options.maxArchives ?? 5;
  }

  public async append(event: AuditEvent): Promise<void> {
    const line = `${JSON.stringify({
      schemaVersion: 2,
      occurredAt: event.occurredAt.toISOString(),
      action: event.action,
      outcome: event.outcome ?? "success",
      entityType: event.entityType,
      ...(event.entityId === undefined ? {} : { entityId: event.entityId }),
      ...(event.root === undefined ? {} : { root: event.root }),
      ...(event.details === undefined ? {} : { details: redactDetails(event.details) }),
    })}\n`;
    await this.ensureSecureLayout();
    await withFileLock(this.filePath, async () => {
      await this.ensureSecureLayout();
      await this.rotateIfNeeded(Buffer.byteLength(line));
      const handle = await this.openAuditFile();
      try {
        await handle.writeFile(line, "utf8");
        await handle.sync();
        await fs.chmod(this.filePath, 0o600);
      } finally {
        await handle.close();
      }
    });
  }

  public async inspect(): Promise<AuditTrailHealth> {
    try {
      await this.ensureSecureLayout();
      const handle = await this.openAuditFile();
      const stat = await handle.stat();
      await handle.close();
      await fs.chmod(this.filePath, 0o600);
      const entries = await fs.readdir(this.logDir);
      return {
        ok: true,
        filePath: this.filePath,
        sizeBytes: stat.size,
        archiveCount: entries.filter((entry) => /^audit\.\d+\.jsonl$/.test(entry)).length,
        message: `audit trail writable (${stat.size} bytes)`,
      };
    } catch (error) {
      return {
        ok: false,
        filePath: this.filePath,
        sizeBytes: 0,
        archiveCount: 0,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async rotateIfNeeded(incomingBytes: number): Promise<void> {
    const current = await fs.stat(this.filePath).catch((error: unknown) => {
      if (isNodeError(error, "ENOENT")) return undefined;
      throw error;
    });
    if (current === undefined || current.size === 0 || current.size + incomingBytes <= this.maxBytes) return;
    if (this.maxArchives <= 0) {
      await fs.truncate(this.filePath, 0);
      return;
    }
    await fs.unlink(`${this.filePath.replace(/\.jsonl$/, "")}.${this.maxArchives}.jsonl`).catch((error: unknown) => {
      if (!isNodeError(error, "ENOENT")) throw error;
    });
    for (let index = this.maxArchives - 1; index >= 1; index -= 1) {
      const source = `${this.filePath.replace(/\.jsonl$/, "")}.${index}.jsonl`;
      const target = `${this.filePath.replace(/\.jsonl$/, "")}.${index + 1}.jsonl`;
      await fs.rename(source, target).catch((error: unknown) => {
        if (!isNodeError(error, "ENOENT")) throw error;
      });
    }
    await fs.rename(this.filePath, `${this.filePath.replace(/\.jsonl$/, "")}.1.jsonl`);
  }

  private async ensureSecureLayout(): Promise<void> {
    await ensureRegularDirectory(this.homeDir);
    await ensureRegularDirectory(this.stateDir);
    await ensureRegularDirectory(this.logDir);
    await ensureSingleLinkAuditFile(this.filePath);
  }

  private async openAuditFile(): Promise<fs.FileHandle> {
    await ensureSingleLinkAuditFile(this.filePath);
    const flags = process.platform === "win32"
      ? constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT
      : constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW;
    return fs.open(this.filePath, flags, 0o600);
  }
}

async function ensureRegularDirectory(path: string): Promise<void> {
  await rejectSymlink(path);
  await fs.mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new PathSecurityError(path, "audit directories must be regular directories");
  }
}

async function rejectSymlink(path: string): Promise<void> {
  try {
    if ((await fs.lstat(path)).isSymbolicLink()) {
      throw new PathSecurityError(path, "symbolic-link audit paths are forbidden");
    }
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
}

async function ensureSingleLinkAuditFile(path: string): Promise<void> {
  try {
    const stat = await fs.lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
      throw new PathSecurityError(path, "audit file must be a single-link regular file");
    }
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
}

function redactDetails(details: Readonly<Record<string, string | number | boolean>>): Readonly<Record<string, string | number | boolean>> {
  return Object.fromEntries(Object.entries(details).map(([key, value]) => [key, isSensitiveKey(key) ? "[REDACTED]" : value]));
}

function isSensitiveKey(key: string): boolean {
  return /(?:authorization|cookie|credential|password|secret|token|api[_-]?key)/i.test(key);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
