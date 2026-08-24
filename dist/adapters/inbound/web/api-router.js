/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { logWebRequestError } from "./web-error-log.js";
import { resolveLocale, translate } from "../../../application/localization/locale.js";
const MAX_BODY_BYTES = 64 * 1024;
export async function routeApi(request, response, service, hub) {
    const locale = requestLocale(request);
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const segments = url.pathname.split("/").filter(Boolean).map(decodeSegment);
    if (segments[0] !== "api" || segments[1] !== "v1")
        return sendError(response, 404, "not_found", locale);
    if (request.method === "GET" && segments[2] === "events" && segments.length === 3) {
        hub.connect(response);
        return;
    }
    try {
        const data = await dispatch(request, segments.slice(2), url, service);
        sendJson(response, data.status, data.value, locale);
    }
    catch (error) {
        logWebRequestError(request, error);
        const clientError = error instanceof ClientRequestError;
        sendError(response, clientError ? error.status : 400, clientError ? error.code : "request_rejected", locale);
    }
}
async function dispatch(request, segments, url, service) {
    const method = request.method ?? "GET";
    if (method === "GET" && same(segments, ["health"]))
        return ok({ status: "ready" });
    if (method === "GET")
        return dispatchGet(segments, url, service);
    if (method === "POST")
        return dispatchPost(request, segments, service);
    if (method === "PUT" && same(segments, ["preferences"]))
        return ok(await service.savePreferences(await body(request)));
    throw new ClientRequestError(404, "not_found");
}
async function dispatchGet(segments, url, service) {
    if (same(segments, ["projects"]))
        return ok(await service.listProjects());
    if (segments.length === 2 && segments[0] === "projects")
        return ok(await service.getProject(id(segments[1])));
    if (segments.length === 4 && segments[0] === "projects" && segments[2] === "features")
        return ok(await service.getFeature(id(segments[1]), id(segments[3])));
    if (segments.length === 6 && segments[0] === "projects" && segments[2] === "features" && segments[4] === "documents")
        return ok(await service.getDocument(id(segments[1]), id(segments[3]), id(segments[5])));
    if (segments.length === 3 && segments[0] === "projects" && segments[2] === "graph") {
        return ok(await service.getGraph(id(segments[1]), url.searchParams.get("featureId") ?? undefined));
    }
    if (segments.length === 3 && segments[0] === "projects" && segments[2] === "governance")
        return ok(await service.getGovernance(id(segments[1])));
    if (segments.length === 3 && segments[0] === "projects" && segments[2] === "agents")
        return ok(await service.getAgents(id(segments[1])));
    if (segments.length === 3 && segments[0] === "projects" && segments[2] === "audits")
        return ok(await service.getAudits(id(segments[1])));
    if (segments.length === 4 && segments[0] === "projects" && segments[2] === "audits")
        return ok(await service.getAudit(id(segments[1]), id(segments[3])));
    if (segments.length === 3 && segments[0] === "projects" && segments[2] === "orchestrations")
        return ok(await service.getOrchestrations(id(segments[1])));
    if (same(segments, ["preferences"]))
        return ok(await service.getPreferences());
    if (same(segments, ["doctor"]))
        return ok(await service.inspectDoctor());
    throw new ClientRequestError(404, "not_found");
}
async function dispatchPost(request, segments, service) {
    if (same(segments, ["folder-picker"]))
        return ok(await service.pickFolder(await body(request)));
    if (same(segments, ["projects"]))
        return created(await service.createProject(await body(request)));
    if (segments.length === 3 && segments[0] === "projects" && segments[2] === "features") {
        return created(await service.createFeature(id(segments[1]), await body(request)));
    }
    if (segments.length === 3 && segments[0] === "projects" && segments[2] === "governance")
        return created(await service.appendGovernance(id(segments[1]), await body(request)));
    if (segments.length === 4 && segments[0] === "projects" && segments[2] === "audits" && segments[3] === "prepare") {
        return created(await service.prepareAudit(id(segments[1]), await body(request)));
    }
    if (segments.length === 5 && segments[0] === "projects" && segments[2] === "audits") {
        const projectId = id(segments[1]);
        const auditId = id(segments[3]);
        const action = segments[4];
        if (action === "start") {
            const input = await body(request);
            if (typeof input.confirmation !== "string")
                throw new ClientRequestError(400, "confirmation_required");
            return ok(await service.startAudit(projectId, auditId, input.confirmation));
        }
        if (action === "finalize")
            return ok(await service.finalizeAudit(projectId, auditId));
        if (action === "cancel")
            return ok(await service.cancelAudit(projectId, auditId));
        if (action === "resume")
            return ok(await service.resumeAudit(projectId, auditId));
    }
    if (same(segments, ["doctor", "repair"]))
        return ok(await service.repairDoctor(await body(request)));
    throw new ClientRequestError(404, "not_found");
}
export function sendJson(response, status, data, locale = "en") {
    const payload = JSON.stringify({
        schemaVersion: 2,
        ok: status >= 200 && status < 300,
        data,
        errors: [],
        warnings: [],
        display: { locale, message: "" },
    });
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
    response.end(payload);
}
export function sendError(response, status, code, locale = "en") {
    const payload = JSON.stringify({
        schemaVersion: 2,
        ok: false,
        data: null,
        errors: [{ code, params: {} }],
        warnings: [],
        display: { locale, message: translate(status === 401 ? "web.error.unauthorized" : "web.error.generic", {}, locale) },
    });
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
    response.end(payload);
}
function requestLocale(request) {
    const header = request.headers["accept-language"];
    return resolveLocale({ environment: {}, ...(typeof header === "string" ? { systemLocale: header } : {}) });
}
async function body(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const value = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(String(chunk));
        size += value.length;
        if (size > MAX_BODY_BYTES)
            throw new ClientRequestError(413, "body_too_large");
        chunks.push(value);
    }
    try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!isRecord(value))
            throw new Error("object required");
        return value;
    }
    catch {
        throw new ClientRequestError(400, "invalid_json");
    }
}
function id(value) {
    if (value === undefined || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value))
        throw new ClientRequestError(400, "invalid_id");
    return value;
}
function decodeSegment(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        throw new ClientRequestError(400, "invalid_path");
    }
}
function same(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
function ok(value) { return { status: 200, value }; }
function created(value) { return { status: 201, value }; }
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
class ClientRequestError extends Error {
    status;
    code;
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}
//# sourceMappingURL=api-router.js.map