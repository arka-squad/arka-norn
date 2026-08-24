/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
export function logWebRequestError(request, error) {
    const method = request.method ?? "UNKNOWN";
    const pathname = safePathname(request.url);
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    process.stderr.write(`[norn-web] ${method} ${pathname} rejected: ${detail}\n`);
}
function safePathname(value) {
    try {
        return new URL(value ?? "/", "http://127.0.0.1").pathname;
    }
    catch {
        return "/invalid-path";
    }
}
//# sourceMappingURL=web-error-log.js.map