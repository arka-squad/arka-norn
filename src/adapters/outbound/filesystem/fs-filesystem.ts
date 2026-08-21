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

/**
 * FsFilesystem — adapter `node:fs/promises` du port Filesystem. Port
 * fidèle de arka-cc-management (adapters/outbound/filesystem/fs-filesystem.ts) :
 * - ENOENT -> FileNotFoundError, EACCES/EPERM -> PermissionDeniedError,
 *   ENOTDIR -> NotADirectoryError, le reste rethrow tel quel.
 * - readDir ne suit pas les symlinks (filtrés entièrement).
 * - resolve()/homeDir() sont purs (path math / os.homedir()).
 *
 * Seul endroit du repo où node:fs/promises, node:os, node:path sont
 * importés hors composition root.
 */
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

import { FileNotFoundError, NotADirectoryError, PermissionDeniedError } from "../../../domain/errors.js";
import type { FileStat, Filesystem, MkdirOptions, RemoveOptions, WriteFileOptions } from "../../../ports/outbound/filesystem.js";

type FsOp = "read" | "write" | "delete";

interface NodeFsError extends Error {
  code?: string;
}

function isNodeFsError(err: unknown): err is NodeFsError {
  return err instanceof Error && typeof (err as NodeFsError).code === "string";
}

function mapError(err: unknown, path: string, op: FsOp): never {
  if (!isNodeFsError(err)) throw err;
  switch (err.code) {
    case "ENOENT":
      throw new FileNotFoundError(path);
    case "EACCES":
    case "EPERM":
      throw new PermissionDeniedError(path, op);
    case "ENOTDIR":
      throw new NotADirectoryError(path);
    default:
      throw err;
  }
}

export class FsFilesystem implements Filesystem {
  public async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path, fsSync.constants.F_OK);
      return true;
    } catch (err) {
      if (isNodeFsError(err) && err.code === "ENOENT") return false;
      if (isNodeFsError(err) && (err.code === "EACCES" || err.code === "EPERM")) {
        throw new PermissionDeniedError(path, "read");
      }
      throw err;
    }
  }

  public async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: options?.recursive ?? false });
    } catch (err) {
      mapError(err, path, "write");
    }
  }

  public async readFile(path: string): Promise<string> {
    try {
      return await fs.readFile(path, "utf8");
    } catch (err) {
      mapError(err, path, "read");
    }
  }

  public async writeFile(path: string, content: string, options?: WriteFileOptions): Promise<void> {
    try {
      const writeOpts: { encoding: BufferEncoding; mode?: number } = { encoding: "utf8" };
      if (options?.mode !== undefined) writeOpts.mode = options.mode;
      await fs.writeFile(path, content, writeOpts);
      if (options?.mode !== undefined) {
        try {
          await fs.chmod(path, options.mode);
        } catch (err) {
          mapError(err, path, "write");
        }
      }
    } catch (err) {
      mapError(err, path, "write");
    }
  }

  public async readDir(path: string): Promise<readonly string[]> {
    try {
      const entries = await fs.readdir(path, { withFileTypes: true });
      const out: string[] = [];
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        out.push(entry.name);
      }
      out.sort();
      return out;
    } catch (err) {
      mapError(err, path, "read");
    }
  }

  public async remove(path: string, options?: RemoveOptions): Promise<void> {
    try {
      await fs.rm(path, { recursive: options?.recursive ?? false, force: options?.force ?? false });
    } catch (err) {
      mapError(err, path, "delete");
    }
  }

  public async stat(path: string): Promise<FileStat> {
    try {
      const s = await fs.stat(path);
      return { isFile: s.isFile(), isDirectory: s.isDirectory(), size: s.isDirectory() ? 0 : s.size, mtime: s.mtime };
    } catch (err) {
      mapError(err, path, "read");
    }
  }

  public resolve(...segments: readonly string[]): string {
    return pathResolve(...segments);
  }

  public homeDir(): string {
    return homedir();
  }
}
