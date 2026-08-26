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
import { InvalidFeatureOptionError } from "../errors.js";
export class Feature {
    id;
    projectId;
    name;
    root;
    pipelineId;
    schemaVersion;
    documentContractVersion;
    pipelineDefinitionVersion;
    framingPlanRef;
    createdAt;
    updatedAt;
    constructor(props) {
        this.id = props.id;
        this.projectId = props.projectId;
        this.name = props.name;
        this.root = props.root;
        this.pipelineId = props.pipelineId;
        this.schemaVersion = props.schemaVersion;
        this.documentContractVersion = props.documentContractVersion ?? (props.schemaVersion === 3 ? 3 : 5);
        this.pipelineDefinitionVersion = props.pipelineDefinitionVersion ?? (props.schemaVersion === 5 ? "2.3" : "legacy-2.0");
        this.framingPlanRef = props.framingPlanRef ?? null;
        this.createdAt = new Date(props.createdAt.getTime());
        this.updatedAt = new Date(props.updatedAt.getTime());
    }
    /**
     * @throws {InvalidFeatureOptionError} si `name` est vide ou `root` n'a
     *   pas l'air d'un chemin absolu.
     */
    static create(props) {
        Feature.validateName(props.name);
        Feature.validateRoot(props.root);
        Feature.validatePipelineId(props.pipelineId);
        Feature.validateFramingContract(props);
        Feature.validateDate(props.createdAt, "createdAt");
        Feature.validateDate(props.updatedAt, "updatedAt");
        if (props.updatedAt.getTime() < props.createdAt.getTime()) {
            throw new InvalidFeatureOptionError("updatedAt", "must not be earlier than createdAt");
        }
        return new Feature(props);
    }
    static validateFramingContract(props) {
        if (props.schemaVersion === 5) {
            if (props.pipelineDefinitionVersion !== "2.3" || props.framingPlanRef === undefined) {
                throw new InvalidFeatureOptionError("framingPlanRef", "schema v5 requires a published framing plan and pipeline definition 2.3");
            }
            if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(props.framingPlanRef.planId)
                || !Number.isInteger(props.framingPlanRef.revision) || props.framingPlanRef.revision < 1
                || !/^[a-f0-9]{64}$/u.test(props.framingPlanRef.fingerprint)
                || !props.framingPlanRef.relativePath.startsWith(".arka-norn/plans/")) {
                throw new InvalidFeatureOptionError("framingPlanRef", "must identify an exact published plan revision");
            }
            return;
        }
        if (props.framingPlanRef !== undefined || (props.pipelineDefinitionVersion !== undefined && props.pipelineDefinitionVersion !== "legacy-2.0")) {
            throw new InvalidFeatureOptionError("pipelineDefinitionVersion", "legacy Feature markers cannot claim a 2.3 framing plan");
        }
    }
    static validateName(name) {
        if (typeof name !== "string" || name.trim().length === 0) {
            throw new InvalidFeatureOptionError("name", "must be a non-empty string");
        }
        if (name.length > 256) {
            throw new InvalidFeatureOptionError("name", `length ${name.length} exceeds 256`);
        }
    }
    static validateRoot(root) {
        if (typeof root !== "string" || root.length === 0) {
            throw new InvalidFeatureOptionError("root", "must be a non-empty string");
        }
        const isPosixAbs = root.startsWith("/");
        const isWinAbs = /^[A-Za-z]:[\\/]/.test(root);
        if (!isPosixAbs && !isWinAbs) {
            throw new InvalidFeatureOptionError("root", "must be an absolute path (POSIX `/...` or Windows `X:\\...`)");
        }
    }
    static validatePipelineId(value) {
        if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
            throw new InvalidFeatureOptionError("pipelineId", "must be a valid pipeline identifier");
        }
    }
    static validateDate(date, field) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            throw new InvalidFeatureOptionError(field, "must be a valid Date");
        }
    }
    // --- Transitions -----------------------------------------------------------
    withName(name, now) {
        return Feature.create({ ...this.toProps(), name, updatedAt: now });
    }
    touched(now) {
        return Feature.create({ ...this.toProps(), updatedAt: now });
    }
    withPipelineId(pipelineId, now) {
        return Feature.create({ ...this.toProps(), pipelineId, updatedAt: now });
    }
    // --- Identity --------------------------------------------------------------
    sameIdentity(other) {
        return this.id.equals(other.id);
    }
    belongsTo(projectId) {
        return this.projectId.equals(projectId);
    }
    toProps() {
        return {
            id: this.id,
            projectId: this.projectId,
            name: this.name,
            root: this.root,
            pipelineId: this.pipelineId,
            schemaVersion: this.schemaVersion,
            documentContractVersion: this.documentContractVersion,
            pipelineDefinitionVersion: this.pipelineDefinitionVersion,
            ...(this.framingPlanRef === null ? {} : { framingPlanRef: this.framingPlanRef }),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
//# sourceMappingURL=feature.js.map