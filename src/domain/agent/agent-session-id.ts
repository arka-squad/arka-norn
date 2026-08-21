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

import { InvalidAgentOptionError } from "../errors.js";

const SESSION_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export class AgentSessionId {
  public static readonly MAIN = AgentSessionId.of("main");

  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static of(value: string): AgentSessionId {
    if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value)) {
      throw new InvalidAgentOptionError("session", "must match [a-z][a-z0-9-]{0,63}");
    }
    return new AgentSessionId(value);
  }

  public static isValid(value: string): boolean {
    return typeof value === "string" && SESSION_ID_PATTERN.test(value);
  }

  public equals(other: AgentSessionId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}

export function deriveAgentSessionId(role: string, subject: string): AgentSessionId {
  const slug = `${role}-${subject}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safe = /^[a-z]/.test(slug) ? slug : `agent-${slug}`;
  return AgentSessionId.of(safe.slice(0, 64).replace(/-+$/g, "") || "agent-session");
}
