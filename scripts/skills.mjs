import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseStrictArguments } from "../dist/adapters/inbound/cli/strict-arguments.js";
import { loadCatalog, loadSkillDefs, renderOpenaiYaml, renderRepoSkillMd, runInstall } from "./install.mjs";

export async function runSkills(argv) {
  const action = argv[0];
  const rest = argv.slice(1);
  if (action === "install") return runInstall(rest);
  const json = rest.includes("--json");
  try {
    const options = parseOptions(rest);
    if (action === "list") {
      const defs = loadSkillDefs(options.profile);
      const health = options.installed ? inspect(defs, options.target) : new Map();
      const data = defs.map((definition) => ({
        name: definition.name,
        version: definition.catalog.version,
        step: definition.catalog.step,
        checksum: definition.catalog.checksum,
        profiles: definition.catalog.profiles,
        ...(options.installed ? { status: health.get(definition.name)?.status ?? "missing" } : {}),
      }));
      return present("skills.list", true, data, [], json, 0);
    }
    if (action === "doctor") {
      const defs = loadSkillDefs(options.profile);
      const checks = [...inspect(defs, options.target).values()];
      const ok = checks.every((check) => check.status === "ok");
      return present("skills.doctor", ok, { profile: options.profile, target: options.target, checks }, ok ? [] : ["Skills absents ou divergents."], json, ok ? 0 : 3);
    }
    throw new Error("Usage : arka-norn skills <list|install|doctor> [--profile all|core|delivery] [--target <repo>] [--installed] [--json]");
  } catch (error) {
    return present(`skills.${action ?? "unknown"}`, false, null, [error instanceof Error ? error.message : String(error)], json, 64);
  }
}

function parseOptions(argv) {
  const parsed = parseStrictArguments(argv, { options: { target: "string", profile: "string", installed: "boolean", json: "boolean" }, minPositionals: 0, maxPositionals: 0 });
  return {
    target: path.resolve(parsed.values.get("target") ?? process.cwd()),
    profile: parsed.values.get("profile") ?? "all",
    installed: parsed.booleans.has("installed"),
  };
}

function inspect(definitions, target) {
  const results = new Map();
  for (const definition of definitions) {
    const expected = [
      { file: path.join(target, ".claude", "skills", definition.name, "SKILL.md"), content: renderRepoSkillMd(definition) },
      { file: path.join(target, ".agents", "skills", definition.name, "SKILL.md"), content: renderRepoSkillMd(definition) },
      { file: path.join(target, ".agents", "skills", definition.name, "agents", "openai.yaml"), content: renderOpenaiYaml(definition) },
    ];
    const files = expected.map((item) => fileStatus(item.file, item.content));
    const status = files.every((file) => file.status === "ok") ? "ok" : files.some((file) => file.status === "divergent") ? "divergent" : "missing";
    results.set(definition.name, { name: definition.name, status, files });
  }
  return results;
}

function fileStatus(file, expected) {
  const expectedChecksum = digest(expected);
  if (!existsSync(file)) return { file, status: "missing", expectedChecksum };
  if (lstatSync(file).isSymbolicLink()) return { file, status: "divergent", expectedChecksum, reason: "symlink" };
  const actualChecksum = digest(readFileSync(file));
  return { file, status: actualChecksum === expectedChecksum ? "ok" : "divergent", expectedChecksum, actualChecksum };
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function present(command, ok, data, errors, json, code) {
  if (json) process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command, ok, data, errors, warnings: [] })}\n`);
  else if (Array.isArray(data)) for (const item of data) console.log(`${item.name}\t${item.version}\t${item.step}${item.status ? `\t${item.status}` : ""}`);
  else if (data?.checks) for (const check of data.checks) console.log(`${check.status.toUpperCase()}\t${check.name}`);
  if (!json) for (const error of errors) console.error(`ERREUR — ${error}`);
  process.exitCode = code;
}

export function catalogSummary() {
  const catalog = loadCatalog();
  return { version: catalog.catalogVersion, skills: catalog.skills.length, profiles: catalog.profiles };
}
