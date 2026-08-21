import { fileURLToPath } from "node:url";
import { createIsolatedExecutionRuntime, normalizeTimeout, resolveAcpExecutable, resolveExecutionWorkspace, validateAgentExecutionMission, } from "./secure-runtime.js";
import { NodeMastraWorkerRunner, } from "./mastra-worker-runner.js";
/**
 * In-memory technical adapter for the first Mastra spike. Product-level
 * persistence remains outside this adapter; callers should persist outcomes in
 * their own Arka execution registry.
 */
export class MastraAgentExecutionAdapter {
    records = new Map();
    runner;
    now;
    providerCredentials;
    constructor(options = {}) {
        const workerScripts = { ...defaultWorkerScripts(), ...(options.workerScripts ?? {}) };
        this.runner = options.runner ?? new NodeMastraWorkerRunner(workerScripts);
        this.now = options.now ?? (() => new Date());
        this.providerCredentials = copyProviderCredentials(options.providerCredentials);
    }
    dispatch(mission) {
        return this.start(mission, 1);
    }
    inspect(input) {
        return Promise.resolve(this.records.get(input.executionId)?.outcome);
    }
    async cancel(input) {
        const entry = this.records.get(input.executionId);
        if (entry === undefined)
            throw new Error("Agent execution was not found.");
        await this.cancelEntry(entry);
        return entry.outcome;
    }
    async retry(input) {
        const previous = this.records.get(input.executionId);
        if (previous === undefined)
            throw new Error("Agent execution was not found.");
        if (previous.outcome.status === "running")
            throw new Error("A running agent execution cannot be retried.");
        return this.start(copyMissionWithNewId(previous.mission, input.newExecutionId), previous.outcome.attempt + 1);
    }
    start(sourceMission, attempt) {
        const mission = normalizeMission(sourceMission);
        if (this.records.has(mission.executionId))
            throw new Error("Agent execution id already exists.");
        const runtime = createIsolatedExecutionRuntime(mission.safeEnvironment, credentialFor(mission, this.providerCredentials));
        const startedAt = this.now().toISOString();
        const entry = {
            mission,
            runtime,
            timeoutMs: normalizeTimeout(mission.timeoutMs),
            outcome: {
                executionId: mission.executionId,
                provider: mission.provider,
                workspace: mission.workspace,
                status: "running",
                attempt,
                retryStrategy: "new-run",
                startedAt,
            },
            completion: Promise.resolve(),
            finished: false,
            cancellationRequested: false,
        };
        this.records.set(mission.executionId, entry);
        try {
            const handle = this.runner.launch({
                payload: toWorkerPayload(mission),
                environment: runtime.environment,
                timeoutMs: entry.timeoutMs,
            });
            entry.handle = handle;
            entry.completion = handle.result.then((result) => this.finish(entry, result), () => this.finish(entry, { status: "interrupted", failure: { code: "WORKER_REJECTED" } }));
            void entry.completion;
            this.linkAbortSignal(entry);
        }
        catch {
            this.finish(entry, { status: "interrupted", failure: { code: "WORKER_START_FAILED" } });
        }
        return Promise.resolve(entry.outcome);
    }
    linkAbortSignal(entry) {
        const signal = entry.mission.signal;
        if (signal === undefined)
            return;
        const listener = () => {
            void this.cancelEntry(entry).catch(() => undefined);
        };
        entry.abortListener = listener;
        if (signal.aborted) {
            listener();
            return;
        }
        signal.addEventListener("abort", listener, { once: true });
    }
    async cancelEntry(entry) {
        if (entry.outcome.status !== "running")
            return;
        entry.cancellationRequested = true;
        if (entry.handle === undefined) {
            this.finish(entry, { status: "cancelled", failure: { code: "CANCELLED" } });
            return;
        }
        try {
            await entry.handle.cancel();
        }
        catch {
            this.finish(entry, { status: "interrupted", failure: { code: "CANCEL_FAILED" } });
            return;
        }
        await entry.completion;
    }
    finish(entry, result) {
        if (entry.finished)
            return;
        entry.finished = true;
        const completedAt = this.now().toISOString();
        const outcome = outcomeForResult(entry, result, completedAt);
        entry.outcome = outcome;
        if (entry.abortListener !== undefined && entry.mission.signal !== undefined) {
            entry.mission.signal.removeEventListener("abort", entry.abortListener);
        }
        try {
            entry.runtime.cleanup();
        }
        catch {
            // A temporary-directory cleanup failure must not turn a settled provider
            // result into an unhandled rejection or expose filesystem details.
        }
    }
}
export function createMastraExecutionPort(options = {}) {
    return new MastraAgentExecutionAdapter(options);
}
function normalizeMission(source) {
    validateAgentExecutionMission(source);
    const workspace = resolveExecutionWorkspace(source.workspace);
    const common = {
        executionId: source.executionId,
        mission: source.mission,
        workspace,
        ...(source.permissionPolicy === undefined ? {} : { permissionPolicy: copyPermissionPolicy(source.permissionPolicy) }),
        ...(source.safeEnvironment === undefined ? {} : { safeEnvironment: { ...source.safeEnvironment } }),
        ...(source.timeoutMs === undefined ? {} : { timeoutMs: source.timeoutMs }),
        ...(source.signal === undefined ? {} : { signal: source.signal }),
    };
    if (source.provider === "codex-acp") {
        return {
            ...common,
            provider: "codex-acp",
            command: resolveAcpExecutable(source.command),
            ...(source.args === undefined ? {} : { args: [...source.args] }),
            ...(source.authMethodId === undefined ? {} : { authMethodId: source.authMethodId }),
            ...(source.model === undefined ? {} : { model: source.model }),
        };
    }
    return {
        ...common,
        provider: "claude",
        ...(source.model === undefined ? {} : { model: source.model }),
    };
}
function toWorkerPayload(mission) {
    const common = {
        type: "run",
        executionId: mission.executionId,
        provider: mission.provider,
        mission: mission.mission,
        workspace: mission.workspace,
        permissionPolicy: copyPermissionPolicy(mission.permissionPolicy),
    };
    if (mission.provider === "codex-acp") {
        return {
            ...common,
            command: mission.command,
            args: [...(mission.args ?? [])],
            ...(mission.authMethodId === undefined ? {} : { authMethodId: mission.authMethodId }),
            ...(mission.model === undefined ? {} : { model: mission.model }),
        };
    }
    return {
        ...common,
        ...(mission.model === undefined ? {} : { model: mission.model }),
    };
}
function outcomeForResult(entry, result, completedAt) {
    const base = {
        ...entry.outcome,
        completedAt,
    };
    if (result.status === "completed" && result.output !== undefined) {
        return {
            ...base,
            status: "completed",
            output: result.output,
            ...(result.sessionId === undefined ? {} : { sessionId: result.sessionId }),
        };
    }
    if (entry.cancellationRequested || result.status === "cancelled") {
        return {
            ...base,
            status: "cancelled",
            failure: failureFor(result.failure?.code ?? "CANCELLED"),
        };
    }
    if (result.status === "awaiting_approval") {
        return {
            ...base,
            status: "awaiting_approval",
            failure: failureFor("PERMISSION_REQUESTED"),
            approval: {
                code: "permission_requested",
                message: "The provider requested a permission that this adapter cannot safely prove is within scope.",
                retryStrategy: "new-run",
            },
        };
    }
    const status = result.status === "failed" ? "failed" : "interrupted";
    return {
        ...base,
        status,
        failure: failureFor(result.failure?.code ?? "WORKER_PROTOCOL"),
    };
}
function failureFor(code) {
    const messages = {
        CANCELLED: "The external agent execution was cancelled.",
        CANCEL_FAILED: "The external agent could not be cancelled cleanly.",
        PERMISSION_REQUESTED: "The provider requested a permission that requires explicit approval.",
        TIMEOUT: "The external agent execution reached its time limit.",
        WORKER_EXITED: "The isolated agent worker exited before returning an outcome.",
        WORKER_OUTPUT_LIMIT: "The isolated agent worker exceeded the output limit.",
        WORKER_PROTOCOL: "The isolated agent worker returned an invalid protocol response.",
        WORKER_REJECTED: "The isolated agent worker rejected its execution.",
        WORKER_START_FAILED: "The isolated agent worker could not be started.",
    };
    return {
        code,
        message: messages[code] ?? "The external agent execution failed.",
        retryable: code !== "CANCELLED",
    };
}
function copyMissionWithNewId(mission, newExecutionId) {
    const common = {
        executionId: newExecutionId,
        mission: mission.mission,
        workspace: mission.workspace,
        ...(mission.permissionPolicy === undefined ? {} : { permissionPolicy: copyPermissionPolicy(mission.permissionPolicy) }),
        ...(mission.safeEnvironment === undefined ? {} : { safeEnvironment: { ...mission.safeEnvironment } }),
        ...(mission.timeoutMs === undefined ? {} : { timeoutMs: mission.timeoutMs }),
    };
    if (mission.provider === "codex-acp") {
        return {
            ...common,
            provider: "codex-acp",
            command: mission.command,
            ...(mission.args === undefined ? {} : { args: [...mission.args] }),
            ...(mission.authMethodId === undefined ? {} : { authMethodId: mission.authMethodId }),
            ...(mission.model === undefined ? {} : { model: mission.model }),
        };
    }
    return {
        ...common,
        provider: "claude",
        ...(mission.model === undefined ? {} : { model: mission.model }),
    };
}
function copyPermissionPolicy(policy) {
    if (policy === undefined || policy === "deny-all")
        return "deny-all";
    return {
        mode: "preauthorized-workspace",
        scopePaths: [...policy.scopePaths],
        permissions: [...policy.permissions],
    };
}
function copyProviderCredentials(value) {
    if (value === undefined)
        return Object.freeze({});
    const claudeApiKey = copyCredential(value.claudeApiKey);
    const codexApiKey = copyCredential(value.codexApiKey);
    return Object.freeze({
        ...(claudeApiKey === undefined ? {} : { claudeApiKey }),
        ...(codexApiKey === undefined ? {} : { codexApiKey }),
    });
}
function copyCredential(value) {
    if (value === undefined)
        return undefined;
    if (value.length === 0 || value.length > 16 * 1024 || value.includes("\u0000")) {
        throw new Error("An explicit provider credential is invalid.");
    }
    return value;
}
function credentialFor(mission, credentials) {
    if (mission.provider === "claude") {
        return credentials.claudeApiKey === undefined ? undefined : { name: "ANTHROPIC_API_KEY", value: credentials.claudeApiKey };
    }
    return credentials.codexApiKey === undefined ? undefined : { name: "OPENAI_API_KEY", value: credentials.codexApiKey };
}
function defaultWorkerScripts() {
    return {
        "codex-acp": fileURLToPath(new URL("../../../../scripts/mastra-acp-worker.mjs", import.meta.url)),
        claude: fileURLToPath(new URL("../../../../scripts/mastra-claude-worker.mjs", import.meta.url)),
    };
}
//# sourceMappingURL=mastra-agent-execution-adapter.js.map