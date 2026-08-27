#!/usr/bin/env node
/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 *
 * Confirms the just-published version is visible on the npm registry. The
 * registry can take a few seconds to propagate after a successful publish, so
 * this retries with a bounded backoff before failing, avoiding a false red on
 * a run whose publish actually succeeded.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const delaysMs = [0, 3_000, 5_000, 8_000, 13_000, 21_000, 34_000];

let published;
for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
  if (delaysMs[attempt] > 0) await sleep(delaysMs[attempt]);
  published = query(version);
  if (published === version) {
    console.log(`Registry confirmed arka-norn@${version} after ${attempt + 1} attempt(s).`);
    process.exit(0);
  }
  console.log(`Attempt ${attempt + 1}: registry returned ${published || "nothing"}; expected ${version}. Retrying.`);
}

console.error(`Registry did not expose arka-norn@${version} after ${delaysMs.length} attempts; last saw ${published || "nothing"}.`);
process.exit(1);

function query(expected) {
  try {
    return execFileSync("npm", ["view", `arka-norn@${expected}`, "version"], { encoding: "utf8" }).trim();
  } catch {
    // npm exits non-zero while the exact version is not yet indexed; treat as not-yet-visible.
    return "";
  }
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}
