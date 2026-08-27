/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { uptime } from "node:os";
import { PRODUCT_VERSION } from "../../../application/product-metadata.js";
import { translate } from "../../../application/localization/locale.js";
import { bootId, evaluateVersionAdvisory } from "../../../application/version/version-advisory.js";
import { FsVersionCacheStore } from "../../outbound/filesystem/fs-version-cache-store.js";
import { FsVersionSkipStore } from "../../outbound/filesystem/fs-version-skip-store.js";
import { fetchLatestNpmVersion } from "../../outbound/version/npm-version-source.js";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Returns a single discreet update reminder line from cached data only, so it
 * adds no latency to the calling command. When the cache is missing or stale it
 * schedules a detached, best-effort refresh for the next invocation.
 */
export async function versionReminderLine(context) {
    const nowMs = context.nowMs ?? Date.now();
    const cacheStore = new FsVersionCacheStore(context.homeDir);
    const cache = await cacheStore.load().catch(() => undefined);
    const stale = cache === undefined || nowMs - Date.parse(cache.checkedAt) > CACHE_TTL_MS || Number.isNaN(Date.parse(cache.checkedAt));
    if (stale && (context.background ?? true)) {
        void refreshCache(context, cacheStore, nowMs);
    }
    if (cache === undefined)
        return undefined;
    const skip = await new FsVersionSkipStore(context.homeDir).load().catch(() => undefined);
    const currentBootId = bootId(nowMs, context.uptimeSeconds ?? uptime());
    const advisory = evaluateVersionAdvisory({ current: PRODUCT_VERSION, latest: cache.latest, ...(skip === undefined ? {} : { skip }), currentBootId });
    if (advisory.status !== "update_available")
        return undefined;
    return translate("cli.version.updateAvailableShort", { current: advisory.current, latest: advisory.latest });
}
async function refreshCache(context, store, nowMs) {
    try {
        const latest = await (context.latestVersion ?? (() => fetchLatestNpmVersion("arka-norn")))();
        if (latest !== undefined)
            await store.save({ latest, checkedAt: new Date(nowMs).toISOString() });
    }
    catch {
        // A reminder must never surface a refresh failure.
    }
}
//# sourceMappingURL=version-reminder.js.map