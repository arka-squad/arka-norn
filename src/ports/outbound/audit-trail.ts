export interface AuditEvent {
  readonly occurredAt: Date;
  readonly action: string;
  readonly entityType: "project" | "feature" | "system";
  readonly entityId?: string;
  readonly root?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface AuditTrail {
  append(event: AuditEvent): Promise<void>;
}
