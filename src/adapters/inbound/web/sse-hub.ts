/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { ServerResponse } from "node:http";

import type { LiveInvalidation } from "../../../application/web/contracts.js";

export class SseHub {
  private readonly clients = new Set<ServerResponse>();
  private revision = 0;

  public connect(response: ServerResponse): void {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    this.clients.add(response);
    this.send(response, { scope: "projects", revision: this.revision, occurredAt: new Date().toISOString() });
    const timer = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
    response.on("close", () => {
      clearInterval(timer);
      this.clients.delete(response);
    });
  }

  public publish(event: Omit<LiveInvalidation, "revision" | "occurredAt">): void {
    this.revision += 1;
    const message: LiveInvalidation = { ...event, revision: this.revision, occurredAt: new Date().toISOString() };
    for (const client of this.clients) {
      try {
        this.send(client, message);
      } catch {
        this.clients.delete(client);
        client.end();
      }
    }
  }

  public close(): void {
    for (const client of this.clients) client.end();
    this.clients.clear();
  }

  private send(response: ServerResponse, event: LiveInvalidation): void {
    response.write(`event: invalidate\ndata: ${JSON.stringify(event)}\n\n`);
  }
}
