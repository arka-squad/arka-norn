import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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

function isMissingModule(error) {
  return error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND";
}
