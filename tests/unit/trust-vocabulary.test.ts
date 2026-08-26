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

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const MESSAGES_DIR = resolve(import.meta.dirname, "..", "..", "src", "application", "localization", "messages");
const ALLOWED_KEYS = new Set([
  // Historical field names and keys that refer to machine concepts, not human labels.
  "web.contract.author_agent_id",
  "web.contract.auteur_agent_id",
]);

function* messageValues(filePath: string): Generator<{ readonly key: string; readonly value: string }> {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*"([^"]+)":\s*"([^"]*)",?\s*$/);
    if (match === null) continue;
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined) continue;
    yield { key, value };
  }
}

test("public human labels do not claim cryptographic signing", () => {
  const errors: string[] = [];
  for (const locale of ["en", "fr"]) {
    const dir = join(MESSAGES_DIR, locale);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts")) continue;
      const filePath = join(dir, file);
      for (const { key, value } of messageValues(filePath)) {
        if (ALLOWED_KEYS.has(key)) continue;
        if (/\bsigned\b/i.test(value) || /\bsigné/i.test(value)) {
          errors.push(`${locale}/${file} ${key}: ${value}`);
        }
      }
    }
  }
  assert.deepEqual(errors, []);
});
