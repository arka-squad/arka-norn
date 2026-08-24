/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
export const WEB_CSP = [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
].join("; ");
export function secureHeaders(response) {
    response.setHeader("Content-Security-Policy", WEB_CSP);
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Cache-Control", "no-store");
}
export function authorizeRequest(request, token, expectedOrigin) {
    if (!isLoopback(request.socket.remoteAddress))
        return false;
    const origin = request.headers.origin;
    const expectedHost = new URL(expectedOrigin).host;
    if (origin === undefined ? request.headers.host !== expectedHost : origin !== expectedOrigin)
        return false;
    const authorization = request.headers.authorization;
    if (authorization === undefined || !authorization.startsWith("Bearer "))
        return false;
    return sameSecret(authorization.slice(7), token);
}
export function isLoopback(address) {
    if (address === undefined)
        return false;
    const normalized = address.startsWith("::ffff:") ? address.slice(7) : address;
    return normalized === "::1" || (isIP(normalized) === 4 && normalized.startsWith("127."));
}
function sameSecret(candidate, expected) {
    const left = Buffer.from(candidate);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
}
//# sourceMappingURL=web-security.js.map