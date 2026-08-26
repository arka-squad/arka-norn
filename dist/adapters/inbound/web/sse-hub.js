/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
export class SseHub {
    clients = new Set();
    revision = 0;
    connect(response) {
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
    publish(event) {
        this.revision += 1;
        const message = { ...event, revision: this.revision, occurredAt: new Date().toISOString() };
        for (const client of this.clients) {
            try {
                this.send(client, message);
            }
            catch {
                this.clients.delete(client);
                client.end();
            }
        }
    }
    close() {
        for (const client of this.clients)
            client.end();
        this.clients.clear();
    }
    send(response, event) {
        response.write(`event: invalidate\ndata: ${JSON.stringify(event)}\n\n`);
    }
}
//# sourceMappingURL=sse-hub.js.map