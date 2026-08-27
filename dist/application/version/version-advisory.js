/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
export function parseSemVer(value) {
    const match = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:[-+].*)?$/u.exec(value.trim());
    if (match === null)
        return undefined;
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}
export function compareSemVer(left, right) {
    if (left.major !== right.major)
        return left.major < right.major ? -1 : 1;
    if (left.minor !== right.minor)
        return left.minor < right.minor ? -1 : 1;
    if (left.patch !== right.patch)
        return left.patch < right.patch ? -1 : 1;
    return 0;
}
/** A stable identifier for the current boot, derived from system uptime. */
export function bootId(nowMs, uptimeSeconds) {
    const bootedAt = Math.round((nowMs - uptimeSeconds * 1_000) / 1_000);
    return String(bootedAt);
}
export function evaluateVersionAdvisory(input) {
    const current = parseSemVer(input.current);
    const latest = input.latest === undefined ? undefined : parseSemVer(input.latest);
    if (current === undefined || latest === undefined || input.latest === undefined) {
        return { status: "unknown", current: input.current };
    }
    if (compareSemVer(latest, current) <= 0) {
        return { status: "up_to_date", current: input.current };
    }
    const skip = input.skip;
    if (skip !== undefined) {
        const skipped = parseSemVer(skip.version);
        const coversLatest = skipped !== undefined && compareSemVer(latest, skipped) <= 0;
        if (skip.kind === "version" && coversLatest) {
            return { status: "skipped_version", current: input.current, latest: input.latest };
        }
        if (skip.kind === "reboot" && coversLatest && skip.bootId === input.currentBootId) {
            return { status: "skipped_reboot", current: input.current, latest: input.latest };
        }
    }
    return { status: "update_available", current: input.current, latest: input.latest };
}
//# sourceMappingURL=version-advisory.js.map