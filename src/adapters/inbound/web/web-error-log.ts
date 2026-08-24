/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { IncomingMessage } from "node:http";

export function logWebRequestError(request: IncomingMessage, error: unknown): void {
  const method = request.method ?? "UNKNOWN";
  const pathname = safePathname(request.url);
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`[norn-web] ${method} ${pathname} rejected: ${detail}\n`);
}

function safePathname(value: string | undefined): string {
  try {
    return new URL(value ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return "/invalid-path";
  }
}
