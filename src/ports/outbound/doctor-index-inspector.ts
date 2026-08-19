import type { DoctorCheck, DoctorRepair } from "../inbound/for-doctor.js";

export interface IndexInspection {
  readonly check: DoctorCheck;
  readonly repair?: DoctorRepair;
}

export interface DoctorIndexInspector {
  inspectIndex(kind: "projects" | "features", repair: boolean, apply: boolean): Promise<IndexInspection>;
}
