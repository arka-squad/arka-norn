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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface SkillCatalogEntry {
  readonly name: string;
  readonly version: string;
  readonly source: string;
  readonly checksum: string;
  readonly step: string;
  readonly profiles: readonly string[];
}

export interface SkillCatalog {
  readonly schemaVersion: number;
  readonly catalogVersion: string;
  readonly profiles: Readonly<Record<string, string>>;
  readonly skills: readonly SkillCatalogEntry[];
}

export interface SkillDefinition {
  readonly name: string;
  readonly repoTitle: string;
  readonly globalTitle: string;
  readonly summary: string;
  readonly useWhen: string;
  readonly doNotUseWhen: string;
  readonly triggers: string;
  readonly interface?: {
    readonly displayName: string;
    readonly shortDescription: string;
    readonly defaultPrompt: string;
  };
  readonly allowedTools: readonly string[];
  readonly whenToUse: readonly string[];
  readonly whenNotToUse: readonly string[];
  readonly inputs: readonly {
    readonly required: boolean;
    readonly name: string;
    readonly description: string;
  }[];
  readonly inputNotes?: string;
  readonly references: readonly string[];
  readonly procedure: readonly {
    readonly title: string;
    readonly content: string;
  }[];
  readonly outputFormat: string;
  readonly catalog: SkillCatalogEntry;
}

export interface SkillCatalogRuntime {
  readonly catalog: SkillCatalog;
  readonly definitions: readonly SkillDefinition[];
  renderRepoSkillMd(definition: SkillDefinition): string;
  renderGlobalSkillMd(definition: SkillDefinition): string;
  renderOpenaiYaml(definition: SkillDefinition): string;
}

export function loadSkillCatalog(frameworkRoot: string): SkillCatalog {
  const source = readJson(join(frameworkRoot, "skills-src", "catalog", "skills.json"));
  if (!isRecord(source) || source["schemaVersion"] !== 2 || typeof source["catalogVersion"] !== "string") {
    throw new Error("Invalid skill catalog: missing or incompatible header.");
  }
  if (!isRecord(source["profiles"]) || !Array.isArray(source["skills"])) {
    throw new Error("Invalid skill catalog: profiles or entries are missing.");
  }
  const profiles: Record<string, string> = {};
  for (const [name, description] of Object.entries(source["profiles"])) {
    if (typeof description !== "string") throw new Error(`Invalid profile description: ${name}`);
    profiles[name] = description;
  }
  const skills = source["skills"].map(parseCatalogEntry);
  const names = new Set(skills.map((entry) => entry.name));
  if (names.size !== skills.length) throw new Error("Invalid skill catalog: duplicate names.");
  return { schemaVersion: 2, catalogVersion: source["catalogVersion"], profiles, skills };
}

export function createSkillCatalogRuntime(frameworkRoot: string, profile = "all"): SkillCatalogRuntime {
  const catalog = loadSkillCatalog(frameworkRoot);
  if (!Object.hasOwn(catalog.profiles, profile)) throw new Error(`Unknown profile: ${profile}`);
  const definitions = catalog.skills
    .filter((entry) => entry.profiles.includes(profile))
    .map((entry) => loadDefinition(frameworkRoot, entry));
  const frameworkName = basename(frameworkRoot);
  const frameworkReference = "$(npm root -g)/arka-norn";
  const substitute = (value: string): string => value
    .replaceAll("{{FRAMEWORK_NAME}}", frameworkName)
    .replaceAll("{{FRAMEWORK_DIR}}", frameworkReference);

  return {
    catalog,
    definitions,
    renderRepoSkillMd(definition): string {
      const description = `${substitute(definition.summary)} ${definition.useWhen} ${definition.doNotUseWhen}`;
      return `---\nname: ${definition.name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${definition.repoTitle}\n\n${substitute(definition.summary)}\n\n${renderBody(definition, substitute, frameworkName, frameworkReference)}`;
    },
    renderGlobalSkillMd(definition): string {
      const tools = definition.allowedTools.map((tool) => `  - ${tool}`).join("\n");
      return `---\nname: ${definition.name}\nversion: ${definition.catalog.version}\ndescription: |\n${wrapYamlBlock(substitute(definition.triggers))}\ncompatibility: claude-code opencode claude-ai\nallowed-tools:\n${tools}\n---\n\n# ${definition.globalTitle}\n\n${substitute(definition.summary)}\n\n${renderBody(definition, substitute, frameworkName, frameworkReference)}`;
    },
    renderOpenaiYaml(definition): string {
      const displayName = substitute(definition.interface?.displayName ?? `Arka - ${definition.name}`);
      const shortDescription = definition.interface === undefined
        ? compactDescription(substitute(definition.summary))
        : substitute(definition.interface.shortDescription);
      const defaultPrompt = substitute(definition.interface?.defaultPrompt ?? `Use $${definition.name} to execute this step with arka-norn gates.`);
      return `interface:\n  display_name: ${JSON.stringify(displayName)}\n  short_description: ${JSON.stringify(shortDescription)}\n  default_prompt: ${JSON.stringify(defaultPrompt)}\n\npolicy:\n  allow_implicit_invocation: true\n`;
    },
  };
}

function compactDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 64) return normalized;
  const candidate = normalized.slice(0, 63);
  const lastSpace = candidate.lastIndexOf(" ");
  const cut = lastSpace >= 24 ? candidate.slice(0, lastSpace) : candidate;
  return `${cut}…`;
}

function loadDefinition(frameworkRoot: string, entry: SkillCatalogEntry): SkillDefinition {
  const sourcePath = join(frameworkRoot, "skills-src", entry.source);
  const raw = readFileSync(sourcePath, "utf8");
  const checksum = createHash("sha256").update(normalizeLineEndings(raw), "utf8").digest("hex");
  if (checksum !== entry.checksum) throw new Error(`Invalid source checksum for ${entry.name}.`);
  const value = JSON.parse(raw) as unknown;
  if (!isSkillDefinition(value)) throw new Error(`Invalid skill definition: ${entry.name}.`);
  if (value.name !== entry.name) throw new Error(`Catalog name mismatch: ${entry.name}.`);
  return { ...value, catalog: entry };
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function parseCatalogEntry(value: unknown, index: number): SkillCatalogEntry {
  if (!isRecord(value)) throw new Error(`Invalid catalog entry at index ${index}.`);
  for (const key of ["name", "version", "source", "checksum", "step"] as const) {
    if (typeof value[key] !== "string" || value[key].length === 0) throw new Error(`Invalid catalog entry: ${key}.`);
  }
  if (!Array.isArray(value["profiles"]) || !value["profiles"].every((item) => typeof item === "string")) {
    throw new Error("Invalid catalog profiles.");
  }
  const name = value["name"] as string;
  const version = value["version"] as string;
  const source = value["source"] as string;
  const checksum = value["checksum"] as string;
  const step = value["step"] as string;
  return {
    name,
    version,
    source,
    checksum,
    step,
    profiles: value["profiles"],
  };
}

function isSkillDefinition(value: unknown): value is Omit<SkillDefinition, "catalog"> {
  if (!isRecord(value)) return false;
  const stringKeys = [
    "name", "repoTitle", "globalTitle", "summary", "useWhen",
    "doNotUseWhen", "triggers", "outputFormat",
  ] as const;
  if (!stringKeys.every((key) => typeof value[key] === "string")) return false;
  if (value["inputNotes"] !== undefined && typeof value["inputNotes"] !== "string") return false;
  if (value["interface"] !== undefined && !isSkillInterface(value["interface"], value["name"] as string)) return false;
  for (const key of ["allowedTools", "whenToUse", "whenNotToUse", "references"] as const) {
    if (!Array.isArray(value[key]) || !value[key].every((item) => typeof item === "string")) return false;
  }
  if (!Array.isArray(value["inputs"]) || !value["inputs"].every(isSkillInput)) return false;
  return Array.isArray(value["procedure"]) && value["procedure"].every(isProcedureStep);
}

function isSkillInterface(value: unknown, skillName: string): value is NonNullable<SkillDefinition["interface"]> {
  if (!isRecord(value)) return false;
  if (typeof value["displayName"] !== "string" || value["displayName"].trim().length === 0) return false;
  if (typeof value["shortDescription"] !== "string" || value["shortDescription"].length < 25 || value["shortDescription"].length > 64) return false;
  return typeof value["defaultPrompt"] === "string" && value["defaultPrompt"].includes(`$${skillName}`);
}

function isSkillInput(value: unknown): value is SkillDefinition["inputs"][number] {
  return isRecord(value)
    && typeof value["required"] === "boolean"
    && typeof value["name"] === "string"
    && typeof value["description"] === "string";
}

function isProcedureStep(value: unknown): value is SkillDefinition["procedure"][number] {
  return isRecord(value) && typeof value["title"] === "string" && typeof value["content"] === "string";
}

function renderBody(
  definition: SkillDefinition,
  substitute: (value: string) => string,
  frameworkName: string,
  frameworkReference: string,
): string {
  const inputs = definition.inputs
    .map((input) => `- **${input.required ? "Required" : "Optional"}**: \`${input.name}\` - ${substitute(input.description)}`)
    .join("\n");
  const referenceExtra = definition.references.length === 0
    ? ""
    : `\n\n${definition.references.map((line) => `- ${substitute(line)}`).join("\n")}`;
  const procedure = definition.procedure
    .map((step, index) => `### step_${index + 1} - ${substitute(step.title)}\n\n${substitute(step.content)}`)
    .join("\n\n");
  return `## When to use\n\n${definition.whenToUse.map((line) => `- ${substitute(line)}`).join("\n")}\n\n## When not to use\n\n${definition.whenNotToUse.map((line) => `- ${substitute(line)}`).join("\n")}\n\n## Inputs\n\n${inputs}${definition.inputNotes === undefined ? "" : `\n\n${substitute(definition.inputNotes)}`}\n\n## References\n\nThis skill drives ${frameworkName}, available through the global \`${frameworkName}\` command. Package references resolve from \`${frameworkReference}\`. If the command is unavailable, this skill does not apply.${referenceExtra}\n\n## Procedure\n\n${procedure}\n\n## Output\n\n${substitute(definition.outputFormat)}\n`;
}

function wrapYamlBlock(value: string, indent = "  ", width = 78): string {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    if (`${line} ${word}`.trim().length > width && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.map((item) => `${indent}${item}`).join("\n");
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
