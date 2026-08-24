/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { spawn } from "node:child_process";
import { translate } from "../../../application/localization/locale.js";
import { WebProcessManager } from "../../../composition/web-process-manager.js";
import { jsonEnvelope } from "./cli-envelope.js";
import { CliUsageError } from "./strict-arguments.js";
export async function runWebCommand(argv, context) {
    const wantsJson = argv.includes("--json");
    try {
        const parsed = parseArguments(argv);
        if (parsed.action === "__serve" && context.environment["ARKA_NORN_WEB_DAEMON"] !== "1") {
            throw new CliUsageError(translate("cli.web.usage"));
        }
        const manager = new WebProcessManager(context);
        const status = await execute(parsed, manager);
        if (!parsed.noOpen && (parsed.action === "start" || parsed.action === "restart" || parsed.action === "foreground")) {
            if (status.url !== undefined)
                openBrowser(status.url);
        }
        const command = parsed.action === "__serve" ? "web.foreground" : `web.${parsed.action}`;
        return {
            code: 0,
            stdout: parsed.json
                ? jsonEnvelope({ command, ok: true, data: publicStatus(status), message: humanStatus(status) })
                : humanStatus(status),
            stderr: "",
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof CliUsageError ? 64 : 3;
        return wantsJson
            ? { code, stdout: jsonEnvelope({ command: "web", ok: false, data: null, errors: [message], errorCode: code === 64 ? "invalid_arguments" : "web_command_failed" }), stderr: "" }
            : { code, stdout: "", stderr: `ERROR: ${message}\n` };
    }
}
async function execute(arguments_, manager) {
    switch (arguments_.action) {
        case "start": return manager.start(arguments_.port);
        case "stop": return manager.stop();
        case "restart": return manager.restart(arguments_.port);
        case "status": return manager.status();
        case "foreground": return manager.foreground(arguments_.port);
        case "__serve": return manager.serve(arguments_.port);
    }
}
function parseArguments(argv) {
    let action = "start";
    let port;
    let noOpen = false;
    let json = false;
    let actionSeen = false;
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (!value.startsWith("--")) {
            if (actionSeen || !isAction(value))
                throw new CliUsageError(translate("cli.web.usage"));
            action = value;
            actionSeen = true;
            continue;
        }
        if (value === "--no-open") {
            noOpen = true;
            continue;
        }
        if (value === "--json") {
            json = true;
            continue;
        }
        if (value === "--port") {
            const candidate = Number(argv[index + 1]);
            if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65_535)
                throw new CliUsageError("--port must be an integer between 1 and 65535.");
            port = candidate;
            index += 1;
            continue;
        }
        throw new CliUsageError(`Unknown web option: ${value}`);
    }
    if ((action === "stop" || action === "status") && (port !== undefined || noOpen))
        throw new CliUsageError(translate("cli.web.usage"));
    if (action === "__serve" && (noOpen || json))
        throw new CliUsageError(translate("cli.web.usage"));
    return { action, ...(port === undefined ? {} : { port }), noOpen, json };
}
function isAction(value) {
    return value === "start" || value === "stop" || value === "restart" || value === "status" || value === "foreground" || value === "__serve";
}
function humanStatus(status) {
    if (status.status === "stopped")
        return `${translate("cli.web.stopped")}\n`;
    if (status.status === "unresponsive")
        return `${translate("cli.web.unresponsive", { logPath: status.logPath })}\n`;
    if (status.url === undefined || status.pid === undefined || status.port === undefined || status.startedAt === undefined) {
        throw new Error("Incomplete Norn Web process state.");
    }
    return `${translate("cli.web.running", { url: status.url })}\n${translate("cli.web.details", {
        pid: status.pid,
        port: status.port,
        startedAt: status.startedAt,
        logPath: status.logPath,
    })}\n`;
}
function publicStatus(status) {
    return status;
}
function openBrowser(url) {
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
}
//# sourceMappingURL=web-cli.js.map