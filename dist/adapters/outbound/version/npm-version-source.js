/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
/**
 * Best-effort lookup of the latest published version on the npm registry.
 * Never throws and returns undefined on any network, timeout or parse issue,
 * so a version check can never block or break a command.
 */
export async function fetchLatestNpmVersion(packageName, timeoutMs = 1_500) {
    if (!/^[a-z0-9._@/-]{1,214}$/u.test(packageName))
        return undefined;
    const url = `https://registry.npmjs.org/${packageName.split("/").map(encodeURIComponent).join("/")}/latest`;
    try {
        const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok)
            return undefined;
        const body = await response.json();
        if (typeof body !== "object" || body === null)
            return undefined;
        const version = body["version"];
        return typeof version === "string" ? version : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=npm-version-source.js.map