import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPipelineRuntime } from "../dist/composition/pipeline-runtime.js";

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runValidate(argv) {
  const json = argv.includes("--json");
  const positional = argv.filter((value) => value !== "--json");
  if (positional.length !== 1) {
    console.error("Usage : arka-norn validate [--json] <fichier.json>");
    process.exitCode = 64;
    return;
  }
  const filePath = path.resolve(positional[0]);
  try {
    const result = await createPipelineRuntime(FRAMEWORK_ROOT).validate({ filePath });
    if (json) {
      process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: result.valid, data: result, errors: result.errors, warnings: [] })}\n`);
    } else if (result.valid) {
      console.log(`VALIDE — ${path.relative(process.cwd(), filePath)} (type: ${result.type}, schema: ${result.schemaPath})`);
    } else {
      console.log(`INVALIDE — ${path.relative(process.cwd(), filePath)}${result.type === undefined ? "" : ` (type: ${result.type})`}`);
      result.errors.forEach((error) => console.log(`  - ${error}`));
    }
    process.exitCode = result.valid ? 0 : 3;
  } catch (error) {
    console.error(`ERREUR — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 70;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runValidate(process.argv.slice(2));
}
