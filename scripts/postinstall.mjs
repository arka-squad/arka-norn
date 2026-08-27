#!/usr/bin/env node
/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 *
 * Prints a branded welcome with the exact next steps after a package install.
 * It is defensive by design: it never fails an install, stays silent in CI or
 * non-interactive contexts, and skips the framework's own development tree.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  if (shouldSkip()) process.exit(0);
  const message = await renderWelcome();
  if (message !== undefined) process.stdout.write(`\n${message}\n`);
} catch {
  // A welcome banner must never break an install.
}
process.exit(0);

function shouldSkip() {
  const env = process.env;
  if (env.ARKA_NORN_SKIP_POSTINSTALL === "1") return true;
  if (env.CI !== undefined && env.CI !== "" && env.CI !== "false") return true;
  if (env.npm_config_loglevel === "silent" || env.npm_config_quiet === "true") return true;
  // Skip when installing inside the framework's own repository (development).
  if (existsSync(join(root, "src")) && existsSync(join(root, "tsconfig.json"))) return true;
  return false;
}

async function renderWelcome() {
  const bannerUrl = pathToFileURL(join(root, "dist", "adapters", "inbound", "tui", "components", "banner.js")).href;
  const themeUrl = pathToFileURL(join(root, "dist", "adapters", "inbound", "tui", "runtime", "theme.js")).href;
  try {
    const [{ renderArkaHeader }, { createTheme }] = await Promise.all([import(bannerUrl), import(themeUrl)]);
    const theme = createTheme(process.env, Boolean(process.stdout.isTTY));
    return [
      ...renderArkaHeader(theme),
      `  ${theme.bold("Get started")}`,
      `    ${theme.arkaAccent("arka-norn setup")}            Install the Agent skills for Codex or Claude Code`,
      `    ${theme.arkaAccent("arka-norn web start")}        Open the Project cockpit in your browser`,
      `    ${theme.arkaAccent("arka-norn framing enter .")}  Frame your first Project from its folder`,
      `    ${theme.arkaAccent("arka-norn guide")}            See the guided walkthrough`,
    ].join("\n");
  } catch {
    return [
      "  arka-norn installed.",
      "  Get started:",
      "    arka-norn setup            Install the Agent skills for Codex or Claude Code",
      "    arka-norn web start        Open the Project cockpit in your browser",
      "    arka-norn framing enter .  Frame your first Project from its folder",
      "    arka-norn guide            See the guided walkthrough",
    ].join("\n");
  }
}

