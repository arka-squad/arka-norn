/**
 * Feature entity — un dossier de feature suivi par arka-norn (pipeline
 * concept -> plan -> ... -> recette QA).
 *
 * Port fidèle du pattern Project (arka-cc-management,
 * core/domain/project/project.ts), simplifié : pas de `code`/`options`
 * (arka-norn ne lance pas de session CLI pour une feature, contrairement à
 * arka-cc-management qui lance `claude --name <code>-<slug>`).
 *
 * Source de vérité sur disque :
 *   `<feature-root>/.arka-norn/feature.json` (marker)
 * Entrée d'index :
 *   `~/.arka-norn/index/features.json` (id + projectId + root + name + updatedAt).
 *
 * Entité IMMUABLE : chaque transition retourne une nouvelle instance.
 */
import { InvalidFeatureOptionError } from "../errors.js";
export class Feature {
    id;
    projectId;
    name;
    root;
    pipelineId;
    schemaVersion;
    createdAt;
    updatedAt;
    constructor(props) {
        this.id = props.id;
        this.projectId = props.projectId;
        this.name = props.name;
        this.root = props.root;
        this.pipelineId = props.pipelineId;
        this.schemaVersion = props.schemaVersion;
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
        Feature.validateDate(props.createdAt, "createdAt");
        Feature.validateDate(props.updatedAt, "updatedAt");
        if (props.updatedAt.getTime() < props.createdAt.getTime()) {
            throw new InvalidFeatureOptionError("updatedAt", "must not be earlier than createdAt");
        }
        return new Feature(props);
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
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
//# sourceMappingURL=feature.js.map