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

export interface ProjectIndexFileV2 {
  readonly schemaVersion: 2;
  readonly entries: readonly ProjectIndexEntryRaw[];
}

export interface ProjectIndexEntryRaw {
  readonly id: string;
  readonly root: string;
  readonly name: string;
  readonly updatedAt: string;
}

export interface FeatureIndexFileV2 {
  readonly schemaVersion: 2;
  readonly entries: readonly FeatureIndexEntryRaw[];
}

export interface FeatureIndexEntryRaw {
  readonly id: string;
  readonly projectId: string;
  readonly root: string;
  readonly name: string;
  readonly updatedAt: string;
}

export type IndexKind = "projects" | "features";

export function isIndexFile(kind: IndexKind, value: unknown): value is ProjectIndexFileV2 | FeatureIndexFileV2 {
  return kind === "projects" ? isProjectIndexFile(value) : isFeatureIndexFile(value);
}

export function isProjectIndexFile(value: unknown): value is ProjectIndexFileV2 {
  const entries = indexEntries(value);
  return entries !== undefined && entries.every(isProjectEntry);
}

export function isFeatureIndexFile(value: unknown): value is FeatureIndexFileV2 {
  const entries = indexEntries(value);
  return entries !== undefined && entries.every(isFeatureEntry);
}

function indexEntries(value: unknown): readonly unknown[] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const index = value as Readonly<Record<string, unknown>>;
  return index["schemaVersion"] === 2 && Array.isArray(index["entries"]) ? index["entries"] : undefined;
}

function isProjectEntry(value: unknown): value is ProjectIndexEntryRaw {
  const entry = record(value);
  return entry !== undefined && string(entry, "id") && string(entry, "root") && string(entry, "name") && dateTime(entry, "updatedAt");
}

function isFeatureEntry(value: unknown): value is FeatureIndexEntryRaw {
  const entry = record(value);
  return entry !== undefined && string(entry, "id") && string(entry, "projectId") && string(entry, "root") && string(entry, "name") && dateTime(entry, "updatedAt");
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
}

function string(value: Readonly<Record<string, unknown>>, key: string): boolean {
  return typeof value[key] === "string" && value[key].length > 0;
}

function dateTime(value: Readonly<Record<string, unknown>>, key: string): boolean {
  return string(value, key) && !Number.isNaN(Date.parse(value[key] as string));
}
