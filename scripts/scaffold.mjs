import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPipelineRuntime } from "../dist/composition/pipeline-runtime.js";
import { parseStrictArguments } from "../dist/adapters/inbound/cli/strict-arguments.js";

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runScaffold(argv) {
  const json = argv.includes("--json");
  let parsed;
  try {
    parsed = parseStrictArguments(argv, { options: { force: "boolean", json: "boolean" }, minPositionals: 2, maxPositionals: 2 });
  } catch (error) {
    console.error(`Usage : arka-norn scaffold [--force] [--json] <step-id> <fichier-sortie.json>\nERREUR — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 64;
    return;
  }
  const force = parsed.booleans.has("force");
  const [stepId, output] = parsed.positionals;
  const outputPath = path.resolve(output);
  try {
    const result = await createPipelineRuntime(FRAMEWORK_ROOT).scaffold({ stepId, outputPath, force });
    if (json) {
      process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: true, data: result, errors: [], warnings: [] })}\n`);
    } else {
      console.log(`Squelette écrit : ${result.outputPath}`);
      console.log(`Valeurs à remplacer : ${result.sentinelPaths.length}`);
    }
    process.exitCode = 0;
  } catch (error) {
    const conflict = error instanceof Error && "code" in error && error.code === "EEXIST";
    const message = conflict ? `Le fichier existe déjà : ${outputPath}. Utilise --force pour confirmer l'écrasement.` : error instanceof Error ? error.message : String(error);
    if (json) {
      process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: false, data: null, errors: [message], warnings: [] })}\n`);
    } else {
      console.error(`ERREUR — ${message}`);
    }
    process.exitCode = conflict ? 5 : 70;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScaffold(process.argv.slice(2));
}
