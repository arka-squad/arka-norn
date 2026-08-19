import { FsDoctor } from "../adapters/outbound/filesystem/fs-doctor.js";
import { createDoctorUseCase } from "../application/doctor/run-doctor.js";
export function createDoctorRuntime(homeDir) {
    return createDoctorUseCase(new FsDoctor(homeDir));
}
//# sourceMappingURL=doctor-runtime.js.map