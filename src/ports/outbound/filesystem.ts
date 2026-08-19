/**
 * Filesystem — basic file/directory operations. Port fidèle de
 * arka-cc-management (core/ports/outbound/filesystem.ts).
 *
 * Aucun `node:*` import ne doit apparaître chez les consommateurs de ce
 * port. Les adapters concrets traduisent les erreurs `node:fs` en erreurs
 * métier nommées (domain/errors.ts).
 */

export interface FileStat {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly mtime: Date;
}

export interface MkdirOptions {
  readonly recursive?: boolean;
}

export interface WriteFileOptions {
  readonly mode?: number;
}

export interface RemoveOptions {
  readonly recursive?: boolean;
  readonly force?: boolean;
}

export interface Filesystem {
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string, options?: WriteFileOptions): Promise<void>;
  readDir(path: string): Promise<readonly string[]>;
  remove(path: string, options?: RemoveOptions): Promise<void>;
  stat(path: string): Promise<FileStat>;
  resolve(...segments: readonly string[]): string;
  homeDir(): string;
}
