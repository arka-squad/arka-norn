export type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorStatus;
  readonly message: string;
  readonly repairable: boolean;
}

export interface DoctorRepair {
  readonly target: string;
  readonly action: "backup_and_reset" | "chmod_0600";
  readonly applied: boolean;
  readonly backupPath?: string;
}

export interface DoctorReport {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly mode: "inspect" | "repair-dry-run" | "repair-apply";
  readonly checks: readonly DoctorCheck[];
  readonly repairs: readonly DoctorRepair[];
}

export interface ForDoctor {
  run(input?: { readonly repair?: boolean; readonly apply?: boolean }): Promise<DoctorReport>;
}
