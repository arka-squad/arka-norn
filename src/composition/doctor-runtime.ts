import { FsDoctor } from "../adapters/outbound/filesystem/fs-doctor.js";
import { createDoctorUseCase } from "../application/doctor/run-doctor.js";
import type { ForDoctor } from "../ports/inbound/for-doctor.js";

export function createDoctorRuntime(homeDir: string): ForDoctor {
  return createDoctorUseCase(new FsDoctor(homeDir));
}
