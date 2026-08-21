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

export interface AuditEvent {
  readonly occurredAt: Date;
  readonly action: string;
  readonly entityType: "project" | "feature" | "agent" | "system";
  readonly entityId?: string;
  readonly root?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
  readonly outcome?: "intent" | "success" | "failure";
}

export interface AuditTrailHealth {
  readonly ok: boolean;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly archiveCount: number;
  readonly message: string;
}

export interface AuditTrail {
  append(event: AuditEvent): Promise<void>;
  inspect(): Promise<AuditTrailHealth>;
}
