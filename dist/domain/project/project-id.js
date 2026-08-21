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
import { InvalidProjectIdError } from "../errors.js";
const PROJECT_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
export class ProjectId {
    value;
    constructor(value) {
        this.value = value;
    }
    static of(value) {
        if (typeof value !== "string") {
            throw new InvalidProjectIdError(String(value), "must be a string");
        }
        if (!PROJECT_ID_REGEX.test(value)) {
            throw new InvalidProjectIdError(value, "must match [a-z0-9][a-z0-9-]{0,63}");
        }
        return new ProjectId(value);
    }
    static isValid(value) {
        return typeof value === "string" && PROJECT_ID_REGEX.test(value);
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
//# sourceMappingURL=project-id.js.map