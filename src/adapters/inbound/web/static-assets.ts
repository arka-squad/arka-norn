/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import * as fs from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, relative } from "node:path";

const MIME: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export async function serveStatic(response: ServerResponse, webRoot: string, requestPath: string): Promise<void> {
  const assetPath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const direct = safeAsset(webRoot, assetPath);
  const content = await readAsset(direct);
  const target = content === undefined ? safeAsset(webRoot, "index.html") : direct;
  const body = content ?? await readAsset(target);
  if (body === undefined) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Norn Web assets are missing. Run npm run build:web.");
    return;
  }
  response.writeHead(200, {
    "Content-Type": MIME[extname(target)] ?? "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": target.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
  });
  response.end(body);
}

function safeAsset(root: string, path: string): string {
  if (path.includes("\0") || path.split(/[\\/]/).includes("..")) throw new Error("Invalid asset path.");
  const target = join(root, path);
  const candidate = relative(root, target);
  if (candidate.startsWith("..") || candidate.startsWith("/")) throw new Error("Asset path escapes Web root.");
  return target;
}

async function readAsset(path: string): Promise<Buffer | undefined> {
  try {
    const stat = await fs.lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    return await fs.readFile(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
