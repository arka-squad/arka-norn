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
export function loadSkillCatalog(frameworkRoot) {
    const source = readJson(join(frameworkRoot, "skills-src", "catalog", "skills.json"));
    if (!isRecord(source) || source["schemaVersion"] !== 2 || typeof source["catalogVersion"] !== "string") {
        throw new Error("Invalid skill catalog: missing or incompatible header.");
    }
    if (!isRecord(source["profiles"]) || !Array.isArray(source["skills"])) {
        throw new Error("Invalid skill catalog: profiles or entries are missing.");
    }
    const profiles = {};
    for (const [name, description] of Object.entries(source["profiles"])) {
        if (typeof description !== "string")
            throw new Error(`Invalid profile description: ${name}`);
        profiles[name] = description;
    }
    const skills = source["skills"].map(parseCatalogEntry);
    const names = new Set(skills.map((entry) => entry.name));
    if (names.size !== skills.length)
        throw new Error("Invalid skill catalog: duplicate names.");
    return { schemaVersion: 2, catalogVersion: source["catalogVersion"], profiles, skills };
}
export function createSkillCatalogRuntime(frameworkRoot, profile = "all") {
    const catalog = loadSkillCatalog(frameworkRoot);
    if (!Object.hasOwn(catalog.profiles, profile))
        throw new Error(`Unknown profile: ${profile}`);
    const definitions = catalog.skills
        .filter((entry) => entry.profiles.includes(profile))
        .map((entry) => loadDefinition(frameworkRoot, entry));
    const frameworkName = basename(frameworkRoot);
    const frameworkReference = "$(npm root -g)/arka-norn";
    const substitute = (value) => value
        .replaceAll("{{FRAMEWORK_NAME}}", frameworkName)
        .replaceAll("{{FRAMEWORK_DIR}}", frameworkReference);
    return {
        catalog,
        definitions,
        renderRepoSkillMd(definition) {
            const description = `${substitute(definition.summary)} ${definition.useWhen} ${definition.doNotUseWhen}`;
            return `---\nname: ${definition.name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${definition.repoTitle}\n\n${substitute(definition.summary)}\n\n${renderBody(definition, substitute, frameworkName, frameworkReference)}`;
        },
        renderGlobalSkillMd(definition) {
            const tools = definition.allowedTools.map((tool) => `  - ${tool}`).join("\n");
            return `---\nname: ${definition.name}\nversion: ${definition.catalog.version}\ndescription: |\n${wrapYamlBlock(substitute(definition.triggers))}\ncompatibility: claude-code opencode claude-ai\nallowed-tools:\n${tools}\n---\n\n# ${definition.globalTitle}\n\n${substitute(definition.summary)}\n\n${renderBody(definition, substitute, frameworkName, frameworkReference)}`;
        },
        renderOpenaiYaml(definition) {
            const displayName = substitute(definition.interface?.displayName ?? `Arka - ${definition.name}`);
            const shortDescription = definition.interface === undefined
                ? compactDescription(substitute(definition.summary))
                : substitute(definition.interface.shortDescription);
            const defaultPrompt = substitute(definition.interface?.defaultPrompt ?? `Use $${definition.name} to execute this step with arka-norn gates.`);
            return `interface:\n  display_name: ${JSON.stringify(displayName)}\n  short_description: ${JSON.stringify(shortDescription)}\n  default_prompt: ${JSON.stringify(defaultPrompt)}\n\npolicy:\n  allow_implicit_invocation: true\n`;
        },
    };
}
function compactDescription(value) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= 64)
        return normalized;
    const candidate = normalized.slice(0, 63);
    const lastSpace = candidate.lastIndexOf(" ");
    const cut = lastSpace >= 24 ? candidate.slice(0, lastSpace) : candidate;
    return `${cut}…`;
}
function loadDefinition(frameworkRoot, entry) {
    const sourcePath = join(frameworkRoot, "skills-src", entry.source);
    const raw = readFileSync(sourcePath, "utf8");
    const checksum = createHash("sha256").update(normalizeLineEndings(raw), "utf8").digest("hex");
    if (checksum !== entry.checksum)
        throw new Error(`Invalid source checksum for ${entry.name}.`);
    const value = JSON.parse(raw);
    if (!isSkillDefinition(value))
        throw new Error(`Invalid skill definition: ${entry.name}.`);
    if (value.name !== entry.name)
        throw new Error(`Catalog name mismatch: ${entry.name}.`);
    return { ...value, catalog: entry };
}
function normalizeLineEndings(value) {
    return value.replace(/\r\n?/g, "\n");
}
function parseCatalogEntry(value, index) {
    if (!isRecord(value))
        throw new Error(`Invalid catalog entry at index ${index}.`);
    for (const key of ["name", "version", "source", "checksum", "step"]) {
        if (typeof value[key] !== "string" || value[key].length === 0)
            throw new Error(`Invalid catalog entry: ${key}.`);
    }
    if (!Array.isArray(value["profiles"]) || !value["profiles"].every((item) => typeof item === "string")) {
        throw new Error("Invalid catalog profiles.");
    }
    const name = value["name"];
    const version = value["version"];
    const source = value["source"];
    const checksum = value["checksum"];
    const step = value["step"];
    return {
        name,
        version,
        source,
        checksum,
        step,
        profiles: value["profiles"],
    };
}
function isSkillDefinition(value) {
    if (!isRecord(value))
        return false;
    const stringKeys = [
        "name", "repoTitle", "globalTitle", "summary", "useWhen",
        "doNotUseWhen", "triggers", "outputFormat",
    ];
    if (!stringKeys.every((key) => typeof value[key] === "string"))
        return false;
    if (value["inputNotes"] !== undefined && typeof value["inputNotes"] !== "string")
        return false;
    if (value["interface"] !== undefined && !isSkillInterface(value["interface"], value["name"]))
        return false;
    for (const key of ["allowedTools", "whenToUse", "whenNotToUse", "references"]) {
        if (!Array.isArray(value[key]) || !value[key].every((item) => typeof item === "string"))
            return false;
    }
    if (!Array.isArray(value["inputs"]) || !value["inputs"].every(isSkillInput))
        return false;
    return Array.isArray(value["procedure"]) && value["procedure"].every(isProcedureStep);
}
function isSkillInterface(value, skillName) {
    if (!isRecord(value))
        return false;
    if (typeof value["displayName"] !== "string" || value["displayName"].trim().length === 0)
        return false;
    if (typeof value["shortDescription"] !== "string" || value["shortDescription"].length < 25 || value["shortDescription"].length > 64)
        return false;
    return typeof value["defaultPrompt"] === "string" && value["defaultPrompt"].includes(`$${skillName}`);
}
function isSkillInput(value) {
    return isRecord(value)
        && typeof value["required"] === "boolean"
        && typeof value["name"] === "string"
        && typeof value["description"] === "string";
}
function isProcedureStep(value) {
    return isRecord(value) && typeof value["title"] === "string" && typeof value["content"] === "string";
}
function renderBody(definition, substitute, frameworkName, frameworkReference) {
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
function wrapYamlBlock(value, indent = "  ", width = 78) {
    const lines = [];
    let line = "";
    for (const word of value.split(/\s+/)) {
        if (`${line} ${word}`.trim().length > width && line.length > 0) {
            lines.push(line);
            line = word;
        }
        else {
            line = `${line} ${word}`.trim();
        }
    }
    if (line.length > 0)
        lines.push(line);
    return lines.map((item) => `${indent}${item}`).join("\n");
}
function readJson(file) {
    return JSON.parse(readFileSync(file, "utf8"));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=skill-catalog.js.map