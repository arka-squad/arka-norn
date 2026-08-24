#!/usr/bin/env node

/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const options = parseArguments(process.argv.slice(2));
const repository = repositoryCoordinates(manifest.repository?.url);
const metrics = await collectMetrics(manifest.name, repository, options.period);

if (options.json) process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
else process.stdout.write(renderMetrics(metrics));

async function collectMetrics(packageName, repository, period) {
  const npm = await npmDownloads(packageName, period);
  const github = githubClones(repository);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    npm,
    github,
    notes: [
      "npm reports package downloads, not unique installations or users.",
      "GitHub reports full clones, not fetches, over its rolling 14-day traffic window.",
    ],
  };
}

async function npmDownloads(packageName, period) {
  const url = `https://api.npmjs.org/downloads/point/${encodeURIComponent(period)}/${encodeURIComponent(packageName)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`npm download API returned HTTP ${String(response.status)}.`);
  const body = await response.json();
  if (!isRecord(body) || !Number.isInteger(body.downloads) || typeof body.start !== "string" || typeof body.end !== "string") {
    throw new Error("npm download API returned an invalid response.");
  }
  return { metric: "downloads", package: packageName, period, start: body.start, end: body.end, count: body.downloads };
}

function githubClones(repository) {
  try {
    const output = execFileSync("gh", ["api", `repos/${repository.owner}/${repository.repo}/traffic/clones?per=day`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    });
    const body = JSON.parse(output);
    if (!isRecord(body) || !Number.isInteger(body.count) || !Number.isInteger(body.uniques) || !Array.isArray(body.clones)) {
      throw new Error("GitHub traffic API returned an invalid response.");
    }
    return {
      available: true,
      metric: "full_clones",
      repository: `${repository.owner}/${repository.repo}`,
      retentionDays: 14,
      count: body.count,
      uniques: body.uniques,
      days: body.clones,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return {
      available: false,
      metric: "full_clones",
      repository: `${repository.owner}/${repository.repo}`,
      retentionDays: 14,
      error: `GitHub clone traffic is unavailable. Check gh authentication and repository Administration read access. ${detail}`,
    };
  }
}

function renderMetrics(metrics) {
  const lines = [
    "arka-norn adoption metrics",
    "",
    `npm downloads (${metrics.npm.start} to ${metrics.npm.end}): ${String(metrics.npm.count)}`,
  ];
  if (metrics.github.available) {
    lines.push(`GitHub full clones (rolling 14 days): ${String(metrics.github.count)}`);
    lines.push(`GitHub unique cloners (rolling 14 days): ${String(metrics.github.uniques)}`);
  } else {
    lines.push(metrics.github.error);
  }
  lines.push("", ...metrics.notes.map((note) => `Note: ${note}`));
  return `${lines.join("\n")}\n`;
}

function parseArguments(argv) {
  let period = "last-month";
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") json = true;
    else if (value === "--period" && validPeriod(argv[index + 1])) period = argv[++index];
    else throw new Error("Usage: npm run metrics:adoption -- [--period last-day|last-week|last-month|last-year|YYYY-MM-DD:YYYY-MM-DD] [--json]");
  }
  return { period, json };
}

function validPeriod(value) {
  return typeof value === "string" && /^(?:last-(?:day|week|month|year)|\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2})$/u.test(value);
}

function repositoryCoordinates(value) {
  if (typeof value !== "string") throw new Error("package.json repository.url is required.");
  const match = value.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/u);
  if (match?.[1] === undefined || match[2] === undefined) throw new Error("package.json must reference a GitHub repository.");
  return { owner: match[1], repo: match[2] };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
