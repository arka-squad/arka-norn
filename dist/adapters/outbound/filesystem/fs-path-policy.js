import * as fs from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { PathSecurityError } from "../../../domain/errors.js";
export class FsPathPolicy {
    async canonicalDirectory(candidate, options = {}) {
        if (!isAbsolute(candidate))
            throw new PathSecurityError(candidate, "path must be absolute");
        const resolved = resolve(candidate);
        let stat;
        try {
            stat = await fs.lstat(resolved);
        }
        catch (error) {
            if (options.allowMissing === true && isNodeError(error, "ENOENT"))
                return canonicalMissingDirectory(resolved);
            throw new PathSecurityError(candidate, isNodeError(error, "ENOENT") ? "path does not exist" : "path cannot be inspected");
        }
        if (stat.isSymbolicLink())
            throw new PathSecurityError(candidate, "symbolic-link roots are forbidden");
        if (!stat.isDirectory())
            throw new PathSecurityError(candidate, "path must reference an existing directory");
        return fs.realpath(resolved);
    }
    async assertContained(parent, child) {
        const canonicalParent = await this.canonicalDirectory(parent);
        const canonicalChild = await this.canonicalDirectory(child, { allowMissing: true });
        const relation = relative(canonicalParent, canonicalChild);
        if (relation.length === 0 || relation === ".." || relation.startsWith(`..${separatorFor(relation)}`) || isAbsolute(relation)) {
            throw new PathSecurityError(child, `path must be strictly contained in ${canonicalParent}`);
        }
        return { parent: canonicalParent, child: canonicalChild };
    }
    async assertMarkerRoot(declaredRoot, actualRoot) {
        const declared = await this.canonicalDirectory(declaredRoot);
        const actual = await this.canonicalDirectory(actualRoot);
        if (declared !== actual)
            throw new PathSecurityError(declaredRoot, `marker root does not match its location ${actual}`);
        return actual;
    }
    async assertWritableFile(filePath, allowedRoot) {
        if (!isAbsolute(filePath))
            throw new PathSecurityError(filePath, "output path must be absolute");
        const canonicalRoot = await this.canonicalDirectory(allowedRoot);
        const parent = await this.canonicalDirectory(resolve(filePath, ".."));
        const relation = relative(canonicalRoot, parent);
        if (relation === ".." || relation.startsWith(`..${separatorFor(relation)}`) || isAbsolute(relation)) {
            throw new PathSecurityError(filePath, `output must stay inside ${canonicalRoot}`);
        }
        try {
            const stat = await fs.lstat(filePath);
            if (stat.isSymbolicLink())
                throw new PathSecurityError(filePath, "symbolic-link outputs are forbidden");
        }
        catch (error) {
            if (!isNodeError(error, "ENOENT"))
                throw error;
        }
        return resolve(parent, basename(filePath));
    }
}
function separatorFor(relation) {
    return relation.includes("\\") ? "\\" : "/";
}
async function canonicalMissingDirectory(candidate) {
    const missing = [];
    let cursor = candidate;
    while (true) {
        try {
            const stat = await fs.lstat(cursor);
            if (stat.isSymbolicLink())
                throw new PathSecurityError(cursor, "symbolic-link ancestors are forbidden");
            if (!stat.isDirectory())
                throw new PathSecurityError(cursor, "existing ancestor is not a directory");
            return resolve(await fs.realpath(cursor), ...missing.reverse());
        }
        catch (error) {
            if (!isNodeError(error, "ENOENT"))
                throw error;
            const parent = dirname(cursor);
            if (parent === cursor)
                throw new PathSecurityError(candidate, "no existing ancestor");
            missing.push(basename(cursor));
            cursor = parent;
        }
    }
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-path-policy.js.map