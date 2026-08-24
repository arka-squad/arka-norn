/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { test } from "node:test";

import { authorizeRequest, isLoopback, WEB_CSP } from "../../src/adapters/inbound/web/web-security.ts";

test("Web security accepts only loopback, matching Origin and exact Bearer token", () => {
  assert.equal(isLoopback("127.0.0.1"), true);
  assert.equal(isLoopback("::1"), true);
  assert.equal(isLoopback("192.168.1.10"), false);
  const request = {
    socket: { remoteAddress: "127.0.0.1" },
    headers: { host: "127.0.0.1:4321", origin: "http://127.0.0.1:4321", authorization: "Bearer exact-token" },
  } as IncomingMessage;
  assert.equal(authorizeRequest(request, "exact-token", "http://127.0.0.1:4321"), true);
  assert.equal(authorizeRequest(request, "another-token", "http://127.0.0.1:4321"), false);
  assert.equal(authorizeRequest(request, "exact-token", "http://127.0.0.1:9999"), false);
  const sameHost = { ...request, headers: { host: "127.0.0.1:4321", authorization: "Bearer exact-token" } } as IncomingMessage;
  const foreignHost = { ...request, headers: { host: "attacker.invalid", authorization: "Bearer exact-token" } } as IncomingMessage;
  assert.equal(authorizeRequest(sameHost, "exact-token", "http://127.0.0.1:4321"), true);
  assert.equal(authorizeRequest(foreignHost, "exact-token", "http://127.0.0.1:4321"), false);
  assert.match(WEB_CSP, /default-src 'self'/);
  assert.match(WEB_CSP, /object-src 'none'/);
});
