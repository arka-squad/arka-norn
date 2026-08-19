import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!isMissingModule(error) || !specifier.endsWith(".js") || !context.parentURL?.startsWith("file:")) {
      throw error;
    }
    const sourceSpecifier = `${specifier.slice(0, -3)}.ts`;
    const sourceUrl = new URL(sourceSpecifier, context.parentURL);
    await access(fileURLToPath(sourceUrl));
    return nextResolve(sourceSpecifier, context);
  }
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.endsWith(".ts")) return nextLoad(url, context);

  const fileName = fileURLToPath(url);
  const source = await readFile(fileName, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      inlineSourceMap: true,
      inlineSources: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  const error = transpiled.diagnostics?.find((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (error !== undefined) throw new SyntaxError(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  return { format: "module", source: transpiled.outputText, shortCircuit: true };
}

function isMissingModule(error) {
  return error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND";
}
