#!/usr/bin/env node

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

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const roots = ["bin", "scripts", "tui", "tests"];
const files = roots.flatMap((root) => collectMjs(join(ROOT, root)));

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    failures++;
    process.stderr.write(result.stderr || result.stdout || `Syntaxe invalide : ${file}\n`);
  }
}

if (failures > 0) {
  console.error(`${failures} fichier(s) JavaScript invalide(s).`);
  process.exit(1);
}
console.log(`${files.length} fichier(s) JavaScript vérifié(s).`);

function collectMjs(directory) {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
  const entries = readdirSync(directory, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...collectMjs(absolute));
    if (entry.isFile() && entry.name.endsWith(".mjs")) out.push(absolute);
  }
  return out.sort();
}
