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

import { InvalidAgentIdError } from "../errors.js";

export const AGENT_ID_PATTERN = /^[A-Z][A-Za-z0-9-]{0,39}_[a-z][a-z0-9-]{0,39}_\d{8}(?:_\d{2})?$/;

export class AgentId {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static of(value: string): AgentId {
    if (typeof value !== "string" || !AGENT_ID_PATTERN.test(value)) {
      throw new InvalidAgentIdError(String(value), "must match Provider_role_YYYYMMDD with an optional _NN collision suffix");
    }
    return new AgentId(value);
  }

  public static isValid(value: string): boolean {
    return typeof value === "string" && AGENT_ID_PATTERN.test(value);
  }

  public equals(other: AgentId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}

export function createReadableAgentId(provider: string, role: string, at: Date, occupiedIds: ReadonlySet<string>): AgentId {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedRole = normalizeRole(role);
  const date = `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, "0")}${String(at.getUTCDate()).padStart(2, "0")}`;
  const base = `${normalizedProvider}_${normalizedRole}_${date}`;
  if (!occupiedIds.has(base)) return AgentId.of(base);
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${base}_${String(index).padStart(2, "0")}`;
    if (!occupiedIds.has(candidate)) return AgentId.of(candidate);
  }
  throw new InvalidAgentIdError(base, "daily provider/role namespace exhausted");
}

export function normalizeProvider(value: string): string {
  const parts = ascii(value).split(/[^A-Za-z0-9]+/).filter(Boolean);
  const normalized = parts.map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`).join("-").slice(0, 40);
  if (normalized.length === 0) throw new InvalidAgentIdError(value, "provider must contain an ASCII letter or digit");
  return normalized;
}

export function normalizeRole(value: string): string {
  const normalized = ascii(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (!/^[a-z]/.test(normalized)) throw new InvalidAgentIdError(value, "role must start with a letter");
  return normalized;
}

function ascii(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
