/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Env -- lecture de la config runtime depuis process.env. Port TS
 * simplifié de arka-cc-management (composition/env.ts) : pas d'API
 * distante (pas d'apiUrl/apiKey -- arka-norn n'a pas de backend).
 */
import { dirname, isAbsolute, resolve } from "node:path";

import type { LogLevel } from "../ports/outbound/logger.js";
import { AgentSessionId } from "../domain/agent/agent-session-id.js";

const DEFAULT_LOG_LEVEL: LogLevel = "info";
const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export interface EnvSource {
  readonly [key: string]: string | undefined;
}

export interface Env {
  readonly homeDir: string | undefined;
  readonly logLevel: LogLevel;
  readonly cwd: string;
  readonly agentSessionId: AgentSessionId;
  readonly raw: EnvSource;
}

export function readEnv(source: EnvSource = process.env, cwd: string = process.cwd()): Env {
  return {
    homeDir: parseHomeDir(source["ARKA_NORN_HOME"]),
    logLevel: parseLogLevel(source["ARKA_NORN_LOG_LEVEL"]),
    cwd,
    agentSessionId: parseAgentSessionId(source["ARKA_NORN_SESSION"]),
    raw: source,
  };
}

function parseAgentSessionId(value: string | undefined): AgentSessionId {
  if (value === undefined || value.trim() === "") return AgentSessionId.MAIN;
  return AgentSessionId.of(value.trim());
}

function parseHomeDir(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const raw = value.trim();
  const absolute = isAbsolute(raw) ? raw : resolve(raw);
  return absolute.endsWith("/.arka-norn") ? dirname(absolute) : absolute;
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (value === undefined || value.trim() === "") return DEFAULT_LOG_LEVEL;
  const normalized = value.trim().toLowerCase();
  if ((LOG_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as LogLevel;
  }
  throw new Error(`Invalid ARKA_NORN_LOG_LEVEL: ${JSON.stringify(value)}`);
}
