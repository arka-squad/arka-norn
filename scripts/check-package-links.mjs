#!/usr/bin/env node
/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 *
 * F1 package link guard: every relative Markdown link shipped in the npm
 * package must resolve to a file that is also shipped. Links to excluded
 * files must use an absolute GitHub URL pinned to the release tag.
 */

import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const alwaysIncluded = ["package.json", "README.md", "README", "LICENSE", "LICENSE.md", "NOTICE", "CHANGELOG.md", "SECURITY.md"];
const packaged = new Set();
for (const pattern of [...(manifest.files ?? []), ...alwaysIncluded]) {
  for (const match of expand(pattern)) packaged.add(match);
}

const markdown = [...packaged].filter((path) => path.endsWith(".md"));
const linkPattern = /\]\(([^)\s]+?)(?:\s+"[^"]*")?\)/gu;
const violations = [];

for (const file of markdown) {
  const absolute = join(root, file);
  const text = readFileSync(absolute, "utf8");
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#|<)/u.test(target)) continue;
    const cleanTarget = target.split("#")[0];
    if (cleanTarget === "") continue;
    const resolved = relative(root, resolve(dirname(absolute), cleanTarget));
    if (resolved.startsWith("..") || resolved.startsWith(sep)) {
      violations.push({ file, target, reason: "escapes the package root" });
      continue;
    }
    if (!isPackaged(resolved)) {
      violations.push({ file, target, reason: "points to a file excluded from the npm package" });
    }
  }
}

if (violations.length > 0) {
  console.error("Relative Markdown links must resolve inside the npm package (use an absolute GitHub tag URL for excluded files):");
  for (const violation of violations) console.error(`- ${violation.file}: ${violation.target} (${violation.reason})`);
  process.exitCode = 1;
} else {
  console.error(`Checked ${markdown.length} packaged Markdown file(s); all relative links resolve inside the package.`);
}

function expand(pattern) {
  const results = [];
  for (const match of globSync(pattern, { cwd: root })) {
    const absolute = join(root, match);
    if (!existsSync(absolute)) continue;
    if (statSync(absolute).isDirectory()) {
      for (const nested of globSync(join(match, "**", "*"), { cwd: root })) {
        const nestedAbsolute = join(root, nested);
        if (existsSync(nestedAbsolute) && statSync(nestedAbsolute).isFile()) results.push(nested);
      }
    } else {
      results.push(match);
    }
  }
  return results;
}

function isPackaged(path) {
  if (packaged.has(path)) return true;
  const absolute = join(root, path);
  if (existsSync(absolute) && statSync(absolute).isDirectory()) {
    for (const candidate of packaged) if (candidate === path || candidate.startsWith(`${path}/`)) return true;
  }
  return false;
}

