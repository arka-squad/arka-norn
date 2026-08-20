import { PathSecurityError, ProjectNotFoundError } from "../../../domain/errors.js";
/**
 * Revalide la relation de possession au moment de lire un marker Feature.
 * L'index et le marker sont tous deux non fiables : aucun appelant ne doit
 * réutiliser une racine Feature avant cette vérification.
 */
export async function loadFeatureWithinProject(deps, root) {
    const feature = await deps.featureStore.load(root);
    const project = await loadProjectForFeature(deps, feature.projectId);
    await deps.pathPolicy.assertContained(project.root, feature.root);
    return feature;
}
export async function loadProjectForFeature(deps, id) {
    const entry = await deps.projectIndexStore.find(id);
    if (entry === undefined)
        throw new ProjectNotFoundError(id.value);
    const project = await deps.projectStore.load(entry.root);
    if (!project.id.equals(id)) {
        throw new PathSecurityError(entry.root, `project marker identity does not match index entry ${entry.id}`);
    }
    return project;
}
export async function loadIndexedFeatureWithinProject(deps, entry) {
    const feature = await loadFeatureWithinProject(deps, entry.root);
    if (feature.id.value !== entry.id || feature.projectId.value !== entry.projectId) {
        throw new PathSecurityError(entry.root, `feature marker identity does not match index entry ${entry.id}`);
    }
    return feature;
}
//# sourceMappingURL=verified-feature.js.map