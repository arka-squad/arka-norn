import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const limit = 700;
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const roots = ["src", "scripts", "tests"];
const ignoredDirectories = new Set(["node_modules", "dist", "coverage"]);

const oversized = roots
  .flatMap((directory) => collect(join(root, directory)))
  .filter((file) => extensions.has(extname(file)))
  .map((file) => ({
    file: relative(root, file),
    lines: readFileSync(file, "utf8").split(/\r?\n/u).length,
  }))
  .filter(({ lines }) => lines > limit)
  .sort((left, right) => right.lines - left.lines);

if (oversized.length > 0) {
  console.error(`Source files must not exceed ${limit} lines:`);
  for (const entry of oversized) console.error(`- ${entry.file}: ${entry.lines}`);
  process.exitCode = 1;
} else {
  console.log(`Maximum source length: ${limit} lines.`);
}

function collect(directory) {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : collect(path);
    return entry.isFile() ? [path] : [];
  });
}
