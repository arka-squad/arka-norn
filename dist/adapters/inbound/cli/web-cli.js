/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { spawn } from "node:child_process";
import { createWebRuntime } from "../../../composition/web-runtime.js";
export async function runWebCommand(argv, context) {
    const parsed = parseArguments(argv);
    const server = await createWebRuntime({
        frameworkRoot: context.frameworkRoot,
        homeDir: context.homeDir,
        cwd: context.cwd,
        sessionId: context.sessionId,
        environment: context.environment,
        ...(parsed.port === undefined ? {} : { port: parsed.port }),
    });
    const shutdown = () => void server.close().finally(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    if (!parsed.noOpen)
        openBrowser(server.url);
    return { code: 0, stdout: `Norn Web is available at ${server.url}\n`, stderr: "" };
}
function parseArguments(argv) {
    let port;
    let noOpen = false;
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === "--no-open") {
            noOpen = true;
            continue;
        }
        if (value === "--port") {
            const candidate = Number(argv[index + 1]);
            if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65_535)
                throw new Error("--port must be an integer between 1 and 65535.");
            port = candidate;
            index += 1;
            continue;
        }
        throw new Error(`Unknown web option: ${value}`);
    }
    return { ...(port === undefined ? {} : { port }), noOpen };
}
function openBrowser(url) {
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
}
//# sourceMappingURL=web-cli.js.map