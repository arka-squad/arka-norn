/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { join, relative } from "node:path";
import chokidar, {} from "chokidar";
export class LiveWatcher {
    management;
    homeDir;
    hub;
    watcher;
    timer;
    pending = new Map();
    contexts = [];
    constructor(management, homeDir, hub) {
        this.management = management;
        this.homeDir = homeDir;
        this.hub = hub;
    }
    async start() {
        await this.refreshContexts();
        this.watcher = chokidar.watch(this.watchPaths(), {
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 180, pollInterval: 50 },
            ignored: (path) => /(?:\.tmp|\.lock|\.DS_Store)$/.test(path),
        });
        this.watcher.on("all", (_event, path) => this.queue(path));
    }
    async refresh() {
        await this.refreshContexts();
        this.watcher?.add(this.watchPaths());
        this.hub.publish({ scope: "projects" });
    }
    async close() {
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        await this.watcher?.close();
    }
    queue(path) {
        if (inside(join(this.homeDir, ".arka-norn", "index"), path)) {
            void this.refresh();
            return;
        }
        const event = this.classify(path);
        if (event === undefined)
            return;
        this.pending.set(`${event.scope}:${event.projectId}:${event.featureId ?? ""}`, event);
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), 250);
    }
    async refreshContexts() {
        const projects = await this.management.projects.list();
        this.contexts = await Promise.all(projects.map(async (project) => ({ project, features: await this.management.features.list(project.id) })));
    }
    watchPaths() {
        return [
            join(this.homeDir, ".arka-norn", "index"),
            join(this.homeDir, ".arka-norn", "workers"),
            ...this.contexts.flatMap(({ project, features }) => [join(project.root, ".arka-norn"), ...features.map((feature) => feature.root)]),
        ];
    }
    flush() {
        for (const event of this.pending.values())
            this.hub.publish(event);
        this.pending.clear();
        this.timer = undefined;
    }
    classify(path) {
        for (const context of this.contexts) {
            const workerRoot = join(this.homeDir, ".arka-norn", "workers", context.project.id.value);
            if (inside(workerRoot, path))
                return { scope: "orchestration", projectId: context.project.id.value };
            for (const feature of context.features) {
                if (inside(feature.root, path))
                    return { scope: "feature", projectId: context.project.id.value, featureId: feature.id.value };
            }
            if (inside(join(context.project.root, ".arka-norn"), path))
                return { scope: "project", projectId: context.project.id.value };
        }
        return undefined;
    }
}
function inside(root, path) {
    const candidate = relative(root, path);
    return candidate === "" || (!candidate.startsWith("..") && !candidate.startsWith("/"));
}
//# sourceMappingURL=live-watcher.js.map