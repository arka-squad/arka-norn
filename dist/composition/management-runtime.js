import { FsAuditTrail } from "../adapters/outbound/filesystem/fs-audit-trail.js";
import { FsAgentRegistryStore } from "../adapters/outbound/filesystem/fs-agent-registry-store.js";
import { FsAgentSessionStore } from "../adapters/outbound/filesystem/fs-agent-session-store.js";
import { FsFeatureIndexStore } from "../adapters/outbound/filesystem/fs-feature-index-store.js";
import { FsFeatureStore } from "../adapters/outbound/filesystem/fs-feature-store.js";
import { FsFilesystem } from "../adapters/outbound/filesystem/fs-filesystem.js";
import { FsPathPolicy } from "../adapters/outbound/filesystem/fs-path-policy.js";
import { FsProjectIndexStore } from "../adapters/outbound/filesystem/fs-project-index-store.js";
import { FsProjectStore } from "../adapters/outbound/filesystem/fs-project-store.js";
import { ConsoleLogger } from "../adapters/outbound/system/console-logger.js";
import { SystemClock } from "../adapters/outbound/system/system-clock.js";
import { AuditUnavailableError } from "../domain/errors.js";
import { createFeatureUseCaseFactory } from "../use-cases/features/create-feature.js";
import { forgetFeatureUseCaseFactory } from "../use-cases/features/forget-feature.js";
import { importFeatureUseCaseFactory } from "../use-cases/features/import-feature.js";
import { listFeaturesUseCaseFactory } from "../use-cases/features/list-features.js";
import { scanFeaturesUseCaseFactory } from "../use-cases/features/scan-features.js";
import { showFeatureUseCaseFactory } from "../use-cases/features/show-feature.js";
import { switchToFeatureUseCaseFactory } from "../use-cases/features/switch-to-feature.js";
import { setFeatureWorkflowUseCaseFactory } from "../use-cases/features/set-feature-workflow.js";
import { createProjectUseCaseFactory } from "../use-cases/projects/create-project.js";
import { forgetProjectUseCaseFactory } from "../use-cases/projects/forget-project.js";
import { importProjectUseCaseFactory } from "../use-cases/projects/import-project.js";
import { listProjectsUseCaseFactory } from "../use-cases/projects/list-projects.js";
import { scanProjectsUseCaseFactory } from "../use-cases/projects/scan-projects.js";
import { showProjectUseCaseFactory } from "../use-cases/projects/show-project.js";
import { switchToProjectUseCaseFactory } from "../use-cases/projects/switch-to-project.js";
import { manageAgentsUseCaseFactory } from "../use-cases/agents/manage-agents.js";
export function createManagementRuntime(options) {
    const logger = options.logger ?? new ConsoleLogger({ threshold: options.logLevel ?? "warn" });
    const filesystem = new FsFilesystem();
    const clock = options.clock ?? new SystemClock();
    const pathPolicy = new FsPathPolicy();
    const audit = options.auditTrail ?? new FsAuditTrail(options.homeDir);
    const projectIndexStore = new FsProjectIndexStore({ homeDir: options.homeDir, logger });
    const projectStore = new FsProjectStore(pathPolicy);
    const featureIndexStore = new FsFeatureIndexStore({ homeDir: options.homeDir, logger });
    const featureStore = new FsFeatureStore(pathPolicy);
    const agentRegistry = new FsAgentRegistryStore(pathPolicy);
    const agentSession = new FsAgentSessionStore(options.homeDir);
    const projectsDeps = { projectStore, indexStore: projectIndexStore, filesystem, clock, logger, pathPolicy };
    const featuresDeps = { featureStore, indexStore: featureIndexStore, projectIndexStore, filesystem, clock, logger, pathPolicy };
    const rawProjects = {
        list: listProjectsUseCaseFactory(projectsDeps),
        create: createProjectUseCaseFactory(projectsDeps),
        importFrom: importProjectUseCaseFactory(projectsDeps),
        show: showProjectUseCaseFactory(projectsDeps),
        forget: forgetProjectUseCaseFactory(projectsDeps),
        switchTo: switchToProjectUseCaseFactory(projectsDeps),
    };
    const rawFeatures = {
        list: listFeaturesUseCaseFactory(featuresDeps),
        create: createFeatureUseCaseFactory(featuresDeps),
        importFrom: importFeatureUseCaseFactory(featuresDeps),
        show: showFeatureUseCaseFactory(featuresDeps),
        forget: forgetFeatureUseCaseFactory(featuresDeps),
        switchTo: switchToFeatureUseCaseFactory(featuresDeps),
        setWorkflow: setFeatureWorkflowUseCaseFactory(featuresDeps),
    };
    const rawScanProjects = scanProjectsUseCaseFactory(projectsDeps);
    const rawScanFeatures = scanFeaturesUseCaseFactory(featuresDeps);
    const rawAgents = manageAgentsUseCaseFactory({ registry: agentRegistry, session: agentSession, clock });
    return {
        agents: auditAgents(rawAgents, audit, logger, clock),
        projects: auditProjects(rawProjects, audit, logger, clock),
        features: auditFeatures(rawFeatures, audit, logger, clock),
        scanProjects: {
            async scan(options) {
                return auditedOperation(audit, logger, clock, { action: "project.scan", entityType: "system" }, async () => {
                    const results = await rawScanProjects(options);
                    return { value: results, details: { discovered: results.filter((item) => item.project !== undefined).length } };
                });
            },
        },
        scanFeatures: {
            async scan(options) {
                return auditedOperation(audit, logger, clock, { action: "feature.scan", entityType: "system" }, async () => {
                    const results = await rawScanFeatures(options);
                    return { value: results, details: { discovered: results.filter((item) => item.feature !== undefined).length } };
                });
            },
        },
    };
}
function auditAgents(base, audit, logger, clock) {
    return {
        list: (project) => base.list(project),
        show: (project, id) => base.show(project, id),
        current: (project) => base.current(project),
        register: (input) => auditedValue(audit, logger, clock, {
            action: "agent.register", entityType: "agent", root: input.project.root,
            details: { projectId: input.project.id.value, provider: input.provider, role: input.role },
        }, () => base.register(input)),
        deactivate: (project, id) => auditedValue(audit, logger, clock, {
            action: "agent.deactivate", entityType: "agent", entityId: id.value, root: project.root,
        }, () => base.deactivate(project, id)),
        replace: (input) => auditedValue(audit, logger, clock, {
            action: "agent.replace", entityType: "agent", entityId: input.replacedAgentId.value, root: input.project.root,
            details: { provider: input.provider, role: input.role },
        }, () => base.replace(input)),
        select: (project, id) => auditedValue(audit, logger, clock, {
            action: "agent.use", entityType: "agent", entityId: id.value, root: project.root,
        }, () => base.select(project, id)),
    };
}
function auditProjects(base, audit, logger, clock) {
    return {
        list: () => base.list(),
        show: (id) => base.show(id),
        create: (input) => auditedValue(audit, logger, clock, { action: "project.create", entityType: "project", entityId: input.id.value, root: input.root }, () => base.create(input)),
        importFrom: (input) => auditedValue(audit, logger, clock, { action: "project.import", entityType: "project", root: input.root }, () => base.importFrom(input)),
        async switchTo(id) { const current = await base.show(id); return auditedValue(audit, logger, clock, { action: "project.use", entityType: "project", entityId: id.value, root: current.root }, () => base.switchTo(id)); },
        async forget(id) { const current = await base.show(id); await auditedValue(audit, logger, clock, { action: "project.forget", entityType: "project", entityId: id.value, root: current.root }, async () => { await base.forget(id); }); },
    };
}
function auditFeatures(base, audit, logger, clock) {
    return {
        list: () => base.list(),
        show: (id) => base.show(id),
        create: (input) => auditedValue(audit, logger, clock, { action: "feature.create", entityType: "feature", entityId: input.id.value, root: input.root }, () => base.create(input)),
        importFrom: (input) => auditedValue(audit, logger, clock, { action: "feature.import", entityType: "feature", root: input.root }, () => base.importFrom(input)),
        async switchTo(id) { const current = await base.show(id); return auditedValue(audit, logger, clock, { action: "feature.use", entityType: "feature", entityId: id.value, root: current.root }, () => base.switchTo(id)); },
        async setWorkflow(input) { const current = await base.show(input.id); return auditedValue(audit, logger, clock, { action: "feature.set-workflow", entityType: "feature", entityId: input.id.value, root: current.root, details: { pipelineId: input.pipelineId } }, () => base.setWorkflow(input)); },
        async forget(id) { const current = await base.show(id); await auditedValue(audit, logger, clock, { action: "feature.forget", entityType: "feature", entityId: id.value, root: current.root }, async () => { await base.forget(id); }); },
    };
}
async function auditedValue(audit, logger, clock, event, operation) {
    return auditedOperation(audit, logger, clock, event, async () => ({ value: await operation() }));
}
async function auditedOperation(audit, logger, clock, event, operation) {
    await appendRequired(audit, logger, { ...event, occurredAt: clock.now(), outcome: "intent" });
    try {
        const result = await operation();
        await appendRequired(audit, logger, { ...event, occurredAt: clock.now(), outcome: "success", ...(result.details === undefined ? {} : { details: result.details }) });
        return result.value;
    }
    catch (error) {
        try {
            await appendRequired(audit, logger, {
                ...event,
                occurredAt: clock.now(),
                outcome: "failure",
                details: { error: error instanceof Error ? error.message : String(error) },
            });
        }
        catch (auditError) {
            logger.error("audit failure record unavailable", { action: event.action, error: auditError instanceof Error ? auditError.message : String(auditError) });
        }
        throw error;
    }
}
async function appendRequired(audit, logger, event) {
    try {
        await audit.append(event);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error("audit trail unavailable", { action: event.action, error: reason });
        throw new AuditUnavailableError(event.action, reason);
    }
}
//# sourceMappingURL=management-runtime.js.map