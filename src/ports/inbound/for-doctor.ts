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

export type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorStatus;
  readonly message: string;
  readonly repairable: boolean;
}

export interface DoctorRepair {
  readonly target: string;
  readonly action: "backup_and_reset" | "chmod_0600" | "remove_abandoned_lock" | "recover_project_publication";
  readonly applied: boolean;
  readonly backupPath?: string;
}

export interface DoctorReport {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly mode: "inspect" | "repair-dry-run" | "repair-apply";
  readonly checks: readonly DoctorCheck[];
  readonly repairs: readonly DoctorRepair[];
  readonly summary: { readonly pass: number; readonly warn: number; readonly fail: number };
}

export type DoctorInspectionReport = DoctorReport & { readonly mode: "inspect" };
export type DoctorRepairPreviewReport = DoctorReport & { readonly mode: "repair-dry-run" };
export type DoctorRepairApplyReport = DoctorReport & { readonly mode: "repair-apply" };

export interface DoctorRepairPlan {
  readonly report: DoctorRepairPreviewReport;
  readonly fingerprint: string;
  readonly expiresAt: string;
}

export interface DoctorRepairOutcome {
  readonly repair: DoctorRepairApplyReport;
  readonly report: DoctorInspectionReport;
}

export interface ForDoctor {
  run(input?: { readonly repair?: boolean; readonly apply?: boolean }): Promise<DoctorReport>;
}

export interface ForDoctorRepairs {
  inspect(): Promise<DoctorInspectionReport>;
  preview(): Promise<DoctorRepairPlan>;
  apply(input: { readonly fingerprint: string; readonly confirmed: true }): Promise<DoctorRepairOutcome>;
}
