/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { join, relative } from "node:path";

import chokidar, { type FSWatcher } from "chokidar";

import type { Project } from "../../../domain/project/project.js";
import type { Feature } from "../../../domain/feature/feature.js";
import type { ManagementRuntime } from "../../../composition/management-runtime.js";
import type { SseHub } from "./sse-hub.js";

interface WatchedContext {
  readonly project: Project;
  readonly features: readonly Feature[];
}

export class LiveWatcher {
  private watcher: FSWatcher | undefined;
  private timer: NodeJS.Timeout | undefined;
  private readonly pending = new Map<string, { readonly scope: "project" | "feature" | "orchestration"; readonly projectId: string; readonly featureId?: string }>();
  private contexts: readonly WatchedContext[] = [];

  public constructor(
    private readonly management: ManagementRuntime,
    private readonly homeDir: string,
    private readonly hub: SseHub,
  ) {}

  public async start(): Promise<void> {
    await this.refreshContexts();
    this.watcher = chokidar.watch(this.watchPaths(), {
      ignoreInitial: true,
      // libuv's recursive fs-event backend can abort the process on Windows
      // when a watched directory is replaced by an atomic write. Polling keeps
      // the daemon alive while preserving the same bounded path set.
      usePolling: process.platform === "win32",
      interval: process.platform === "win32" ? 250 : 100,
      binaryInterval: process.platform === "win32" ? 250 : 300,
      awaitWriteFinish: { stabilityThreshold: 180, pollInterval: 50 },
      ignored: (path) => /(?:\.tmp|\.lock|\.DS_Store)$/.test(path),
    });
    this.watcher.on("all", (_event, path) => this.queue(path));
  }

  public async refresh(): Promise<void> {
    await this.refreshContexts();
    this.watcher?.add(this.watchPaths());
    this.hub.publish({ scope: "projects" });
  }

  public async close(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    await this.watcher?.close();
  }

  private queue(path: string): void {
    if (inside(join(this.homeDir, ".arka-norn", "index"), path)) {
      void this.refresh();
      return;
    }
    const event = this.classify(path);
    if (event === undefined) return;
    this.pending.set(`${event.scope}:${event.projectId}:${event.featureId ?? ""}`, event);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  private async refreshContexts(): Promise<void> {
    const projects = await this.management.projects.list();
    this.contexts = await Promise.all(projects.map(async (project) => ({ project, features: await this.management.features.list(project.id) })));
  }

  private watchPaths(): string[] {
    return [
      join(this.homeDir, ".arka-norn", "index"),
      join(this.homeDir, ".arka-norn", "workers"),
      ...this.contexts.flatMap(({ project, features }) => [join(project.root, ".arka-norn"), ...features.map((feature) => feature.root)]),
    ];
  }

  private flush(): void {
    for (const event of this.pending.values()) this.hub.publish(event);
    this.pending.clear();
    this.timer = undefined;
  }

  private classify(path: string): { readonly scope: "project" | "feature" | "orchestration"; readonly projectId: string; readonly featureId?: string } | undefined {
    for (const context of this.contexts) {
      const workerRoot = join(this.homeDir, ".arka-norn", "workers", context.project.id.value);
      if (inside(workerRoot, path)) return { scope: "orchestration", projectId: context.project.id.value };
      for (const feature of context.features) {
        if (inside(feature.root, path)) return { scope: "feature", projectId: context.project.id.value, featureId: feature.id.value };
      }
      if (inside(join(context.project.root, ".arka-norn"), path)) return { scope: "project", projectId: context.project.id.value };
    }
    return undefined;
  }
}

function inside(root: string, path: string): boolean {
  const candidate = relative(root, path);
  return candidate === "" || (!candidate.startsWith("..") && !candidate.startsWith("/"));
}
