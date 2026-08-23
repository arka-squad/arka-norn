import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md"]);
const roots = ["src", "scripts", "schemas", "pipelines", "skills-src", "examples", "docs"];
const ignoredDirectories = new Set(["node_modules", "dist", "coverage"]);
const allowedPrefixes = [
  `src${sep}application${sep}localization${sep}messages${sep}fr${sep}`,
  `src${sep}domain${sep}compatibility${sep}`,
  `src${sep}application${sep}compatibility${sep}`,
  `schemas${sep}legacy${sep}fr${sep}`,
  `pipelines${sep}legacy${sep}fr${sep}`,
];

const frenchSignals = [
  /[À-ÿ]/u,
  /\b(?:avec|aucun|cette|chaque|comme|dans|depuis|doit|étape|fichier|français|gestion|lorsque|mais|pour|projet|sans|sur|une|utilisateur|vérification)\b/iu,
];

const violations = roots
  .flatMap((directory) => collect(join(root, directory)))
  .filter((file) => extensions.has(extname(file)))
  .flatMap((file) => {
    const localPath = relative(root, file);
    if (localPath === `scripts${sep}check-language.mjs`) return [];
    if (allowedPrefixes.some((prefix) => localPath.startsWith(prefix))) return [];
    return readFileSync(file, "utf8")
      .split(/\r?\n/u)
      .map((line, index) => ({ file: localPath, line: index + 1, text: line.trim() }))
      .filter(({ text }) => text && frenchSignals.some((pattern) => pattern.test(text)))
      .filter(({ text }) => !text.includes("French triggers include") && !text.startsWith('"triggers":'))
      .filter(({ text }) => !text.includes("language-gate: allow-fr"));
  });

if (violations.length > 0) {
  console.error("French text is restricted to FR locale catalogs and legacy compatibility fixtures:");
  for (const violation of violations.slice(0, 100)) {
    console.error(`- ${violation.file}:${violation.line}: ${violation.text}`);
  }
  if (violations.length > 100) console.error(`- ... ${violations.length - 100} more violation(s)`);
  process.exitCode = 1;
} else {
  console.log("Canonical source and public documentation are English-only.");
}

function collect(directory) {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : collect(path);
    return entry.isFile() ? [path] : [];
  });
}
