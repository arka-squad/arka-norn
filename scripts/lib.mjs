import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FRAMEWORK_ROOT = path.resolve(__dirname, "..");

export function loadJson(absPath) {
  if (!existsSync(absPath)) {
    throw new Error(`Fichier introuvable : ${absPath}`);
  }
  const raw = readFileSync(absPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON invalide dans ${absPath} : ${err.message}`);
  }
}

export function loadPipeline() {
  return loadJson(path.join(FRAMEWORK_ROOT, "pipeline.json"));
}

/** Retourne la définition d'étape (steps[] ou transversal.handoff) dont le "type" JSON correspond. */
export function findStepForType(pipeline, type) {
  const step = pipeline.steps.find((s) => s.id === type);
  if (step) return step;
  if (pipeline.transversal && pipeline.transversal[type]) {
    return { id: type, ...pipeline.transversal[type], obligatoire: false, multiple: true, depend_de: [] };
  }
  return null;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date", {
  type: "string",
  validate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
});
ajv.addFormat("date-time", {
  type: "string",
  validate: (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
});
ajv.addSchema(loadJson(path.join(FRAMEWORK_ROOT, "schemas", "document-envelope.schema.json")));
const validatorCache = new Map();

/** Compile (avec cache) le validateur Ajv pour un schema donné, référencé relativement à FRAMEWORK_ROOT. */
export function getValidator(schemaRelPath) {
  if (validatorCache.has(schemaRelPath)) return validatorCache.get(schemaRelPath);
  const schemaAbsPath = path.join(FRAMEWORK_ROOT, schemaRelPath);
  const schema = loadJson(schemaAbsPath);
  const validateFn = ajv.compile(schema);
  validatorCache.set(schemaRelPath, validateFn);
  return validateFn;
}

const SCAFFOLD_SENTINEL_PATTERN = /^(À_REMPLIR|À_CHOISIR::)/;

/**
 * Détecte récursivement les valeurs sentinelles laissées par scaffold.mjs
 * (ex: "À_REMPLIR", "À_CHOISIR::a|b|c") dans un document déjà parsé.
 * Nécessaire car une sentinelle de type string reste un JSON Schema "type":"string"
 * valide : sans ce contrôle, un squelette jamais rempli validerait déjà (faux "done").
 */
export function findScaffoldSentinels(value, pathPrefix = "") {
  const found = [];
  if (typeof value === "string") {
    if (SCAFFOLD_SENTINEL_PATTERN.test(value)) {
      found.push({ instancePath: pathPrefix || "(racine)", message: `valeur sentinelle de scaffold non remplacée : "${value}"` });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => found.push(...findScaffoldSentinels(item, `${pathPrefix}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      found.push(...findScaffoldSentinels(v, `${pathPrefix}.${key}`));
    }
  }
  return found;
}

/** Valide un objet document (déjà parsé) contre le schema associé à son champ "type". */
export function validateDocument(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, type: null, errors: [{ message: "Le document JSON doit être un objet." }] };
  }
  const pipeline = loadPipeline();
  const type = doc.type;
  if (!type) {
    return { ok: false, type: null, errors: [{ message: 'Champ "type" manquant : impossible de savoir quel schema appliquer.' }] };
  }
  const step = findStepForType(pipeline, type);
  if (!step) {
    return { ok: false, type, errors: [{ message: `Type "${type}" inconnu du pipeline (voir pipeline.json).` }] };
  }
  const validateFn = getValidator(step.schema);
  const schemaOk = validateFn(doc);
  const sentinelErrors = findScaffoldSentinels(doc);
  const ok = schemaOk && sentinelErrors.length === 0;
  const errors = [...(schemaOk ? [] : validateFn.errors || []), ...sentinelErrors];
  return { ok, type, step, errors };
}

export function formatAjvErrors(errors) {
  return errors
    .map((e) => `  - ${e.instancePath || "(racine)"} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`)
    .join("\n");
}
