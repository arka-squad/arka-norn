import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(projectRoot, "dist");

if (distDir !== resolve(projectRoot, "dist") || dirname(distDir) !== projectRoot) {
  throw new Error(`Refus de nettoyer une cible inattendue : ${distDir}`);
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
