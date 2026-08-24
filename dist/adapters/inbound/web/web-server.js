/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { routeApi, sendError } from "./api-router.js";
import { LiveWatcher } from "./live-watcher.js";
import { secureHeaders, authorizeRequest, isLoopback } from "./web-security.js";
import { serveStatic } from "./static-assets.js";
import { SseHub } from "./sse-hub.js";
import { resolveLocale } from "../../../application/localization/locale.js";
export async function startWebServer(options) {
    const token = options.token ?? randomBytes(32).toString("base64url");
    const hub = new SseHub();
    const watcher = new LiveWatcher(options.management, options.homeDir, hub);
    let origin = "";
    const server = createServer((request, response) => {
        void handleRequest(request, response, options, hub, token, () => origin);
    });
    await listen(server, options.port ?? 0);
    const address = server.address();
    if (address === null || typeof address === "string")
        throw new Error("Norn Web did not acquire a TCP port.");
    origin = `http://127.0.0.1:${address.port}`;
    await watcher.start().catch(async (error) => {
        await closeServer(server);
        throw error;
    });
    return {
        port: address.port,
        token,
        url: `${origin}/#token=${token}`,
        async close() {
            hub.close();
            await watcher.close();
            await closeServer(server);
        },
    };
}
async function handleRequest(request, response, options, hub, token, origin) {
    secureHeaders(response);
    const header = request.headers["accept-language"];
    const locale = resolveLocale({ environment: {}, ...(typeof header === "string" ? { systemLocale: header } : {}) });
    if (!isLoopback(request.socket.remoteAddress))
        return sendError(response, 403, "loopback_required", locale);
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
        if (url.pathname.startsWith("/api/")) {
            if (!authorizeRequest(request, token, origin()))
                return sendError(response, 401, "unauthorized", locale);
            await routeApi(request, response, options.service, hub);
        }
        else if (request.method === "GET" || request.method === "HEAD") {
            await serveStatic(response, options.webRoot, url.pathname);
        }
        else {
            sendError(response, 405, "method_not_allowed", locale);
        }
    }
    catch {
        if (!response.headersSent)
            sendError(response, 400, "request_rejected", locale);
        else
            response.end();
    }
}
function listen(server, port) {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
        });
    });
}
function closeServer(server) {
    return new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
}
//# sourceMappingURL=web-server.js.map