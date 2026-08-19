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
  readonly titre_h1_repo: string;
  readonly titre_h1_global: string;
  readonly description_courte: string;
  readonly description_do_use: string;
  readonly description_do_not_use: string;
  readonly declencheurs_globaux: string;
  readonly interface?: {
    readonly display_name: string;
    readonly short_description: string;
    readonly default_prompt: string;
  };
  readonly allowed_tools: readonly string[];
  readonly quand_utiliser: readonly string[];
  readonly quand_ne_pas_utiliser: readonly string[];
  readonly inputs: readonly {
    readonly obligatoire: boolean;
    readonly nom: string;
    readonly description: string;
  }[];
  readonly note_inputs?: string;
  readonly referentiel_extra: readonly string[];
  readonly procedure: readonly {
    readonly titre: string;
    readonly contenu: string;
  }[];
  readonly format_sortie: string;
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
  if (!isRecord(source) || source["schemaVersion"] !== 1 || typeof source["catalogVersion"] !== "string") {
    throw new Error("Catalogue de skills invalide : en-tête absent ou incompatible");
  }
  if (!isRecord(source["profiles"]) || !Array.isArray(source["skills"])) {
    throw new Error("Catalogue de skills invalide : profils ou entrées absents");
  }
  const profiles: Record<string, string> = {};
  for (const [name, description] of Object.entries(source["profiles"])) {
    if (typeof description !== "string") throw new Error(`Description de profil invalide : ${name}`);
    profiles[name] = description;
  }
  const skills = source["skills"].map(parseCatalogEntry);
  const names = new Set(skills.map((entry) => entry.name));
  if (names.size !== skills.length) throw new Error("Catalogue de skills invalide : noms dupliqués");
  return { schemaVersion: 1, catalogVersion: source["catalogVersion"], profiles, skills };
}

export function createSkillCatalogRuntime(frameworkRoot: string, profile = "all"): SkillCatalogRuntime {
  const catalog = loadSkillCatalog(frameworkRoot);
  if (!Object.hasOwn(catalog.profiles, profile)) throw new Error(`Profil inconnu : ${profile}`);
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
      const description = `${substitute(definition.description_courte)} ${definition.description_do_use} ${definition.description_do_not_use}`;
      return `---\nname: ${definition.name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${definition.titre_h1_repo}\n\n${substitute(definition.description_courte)}\n\n${renderBody(definition, substitute, frameworkName, frameworkReference)}`;
    },
    renderGlobalSkillMd(definition): string {
      const tools = definition.allowed_tools.map((tool) => `  - ${tool}`).join("\n");
      return `---\nname: ${definition.name}\nversion: 1.0.0\ndescription: |\n${wrapYamlBlock(substitute(definition.declencheurs_globaux))}\ncompatibility: claude-code opencode claude-ai\nallowed-tools:\n${tools}\n---\n\n# ${definition.titre_h1_global}\n\n${substitute(definition.description_courte)}\n\n${renderBody(definition, substitute, frameworkName, frameworkReference)}`;
    },
    renderOpenaiYaml(definition): string {
      const displayName = substitute(definition.interface?.display_name ?? `Arka — ${definition.name}`);
      const shortDescription = definition.interface === undefined
        ? compactDescription(substitute(definition.description_courte))
        : substitute(definition.interface.short_description);
      const defaultPrompt = substitute(definition.interface?.default_prompt ?? `Utilise $${definition.name} pour exécuter cette étape avec les gates arka-norn.`);
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
  if (checksum !== entry.checksum) throw new Error(`Checksum source invalide pour ${entry.name}`);
  const value = JSON.parse(raw) as unknown;
  if (!isSkillDefinition(value)) throw new Error(`Définition de skill invalide : ${entry.name}`);
  if (value.name !== entry.name) throw new Error(`Nom de catalogue incohérent : ${entry.name}`);
  return { ...value, catalog: entry };
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function parseCatalogEntry(value: unknown, index: number): SkillCatalogEntry {
  if (!isRecord(value)) throw new Error(`Entrée de catalogue invalide à l'index ${index}`);
  for (const key of ["name", "version", "source", "checksum", "step"] as const) {
    if (typeof value[key] !== "string" || value[key].length === 0) throw new Error(`Entrée de catalogue invalide : ${key}`);
  }
  if (!Array.isArray(value["profiles"]) || !value["profiles"].every((item) => typeof item === "string")) {
    throw new Error("Profils de catalogue invalides");
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
    "name", "titre_h1_repo", "titre_h1_global", "description_courte", "description_do_use",
    "description_do_not_use", "declencheurs_globaux", "format_sortie",
  ] as const;
  if (!stringKeys.every((key) => typeof value[key] === "string")) return false;
  if (value["note_inputs"] !== undefined && typeof value["note_inputs"] !== "string") return false;
  if (value["interface"] !== undefined && !isSkillInterface(value["interface"], value["name"] as string)) return false;
  for (const key of ["allowed_tools", "quand_utiliser", "quand_ne_pas_utiliser", "referentiel_extra"] as const) {
    if (!Array.isArray(value[key]) || !value[key].every((item) => typeof item === "string")) return false;
  }
  if (!Array.isArray(value["inputs"]) || !value["inputs"].every(isSkillInput)) return false;
  return Array.isArray(value["procedure"]) && value["procedure"].every(isProcedureStep);
}

function isSkillInterface(value: unknown, skillName: string): value is NonNullable<SkillDefinition["interface"]> {
  if (!isRecord(value)) return false;
  if (typeof value["display_name"] !== "string" || value["display_name"].trim().length === 0) return false;
  if (typeof value["short_description"] !== "string" || value["short_description"].length < 25 || value["short_description"].length > 64) return false;
  return typeof value["default_prompt"] === "string" && value["default_prompt"].includes(`$${skillName}`);
}

function isSkillInput(value: unknown): value is SkillDefinition["inputs"][number] {
  return isRecord(value)
    && typeof value["obligatoire"] === "boolean"
    && typeof value["nom"] === "string"
    && typeof value["description"] === "string";
}

function isProcedureStep(value: unknown): value is SkillDefinition["procedure"][number] {
  return isRecord(value) && typeof value["titre"] === "string" && typeof value["contenu"] === "string";
}

function renderBody(
  definition: SkillDefinition,
  substitute: (value: string) => string,
  frameworkName: string,
  frameworkReference: string,
): string {
  const inputs = definition.inputs
    .map((input) => `- **${input.obligatoire ? "Obligatoire" : "Optionnel"}** : \`${input.nom}\` — ${substitute(input.description)}`)
    .join("\n");
  const referenceExtra = definition.referentiel_extra.length === 0
    ? ""
    : `\n\n${definition.referentiel_extra.map((line) => `- ${substitute(line)}`).join("\n")}`;
  const procedure = definition.procedure
    .map((step, index) => `### step_${index + 1} — ${substitute(step.titre)}\n\n${substitute(step.contenu)}`)
    .join("\n\n");
  return `## Quand utiliser cette skill\n\n${definition.quand_utiliser.map((line) => `- ${substitute(line)}`).join("\n")}\n\n## Quand NE PAS utiliser\n\n${definition.quand_ne_pas_utiliser.map((line) => `- ${substitute(line)}`).join("\n")}\n\n## Inputs attendus\n\n${inputs}${definition.note_inputs === undefined ? "" : `\n\n${substitute(definition.note_inputs)}`}\n\n## Référentiel mobilisé\n\nCe skill pilote ${frameworkName}, disponible via la commande globale \`${frameworkName}\`. Les références du package se résolvent avec \`${frameworkReference}\`. Si cette commande est absente du PATH, ce skill ne s'applique pas.${referenceExtra}\n\n## Procédure\n\n${procedure}\n\n## Format de sortie\n\n${substitute(definition.format_sortie)}\n`;
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
