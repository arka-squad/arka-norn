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
