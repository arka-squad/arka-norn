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
