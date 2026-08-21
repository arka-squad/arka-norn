import { DomainError } from "../../../domain/errors.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createOrchestrationRuntime } from "../../../composition/orchestration-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import type { ExecutionPolicy } from "../../../domain/orchestration/execution-policy.js";
import type { ExecutionRecord } from "../../../domain/orchestration/execution-record.js";
import { isExecutionProvider } from "../../../domain/orchestration/types.js";
import type { OrchestrationPreview, OrchestrationStatus } from "../../../ports/inbound/for-orchestration.js";
import type { CliExecution } from "./cli-execution.js";
import { CliUsageError, parseStrictArguments, type StrictArgumentSpec } from "./strict-arguments.js";

export interface OrchestrationCliContext {
  readonly homeDir: string;
  readonly cwd: string;
  readonly frameworkRoot: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export const ORCHESTRATION_HELP = `Pilote assisté local (Arka contrôle, un assistant exécute)

  orchestration configure --project <id> --provider <claude|codex|kimi|zai> --model <version> [--json]
  orchestration preview --project <id> --feature <id> [--json]
  orchestration start --project <id> --feature <id> --provider <claude|codex|kimi|zai> --model <version> --preview <empreinte> [--json]
  orchestration status --project <id> [--json]
  orchestration cancel <execution-id> --project <id> [--json]
  orchestration approve <execution-id> --project <id> [--json]
  orchestration retry <execution-id> --project <id> [--json]

1. Enregistrer l'assistant et sa version dans le Project avec configure.
2. Lire l'aperçu de la prochaine mission avec preview.
3. Confirmer exactement cet aperçu avec start et son empreinte.

start arme le Pilote assisté du Project. Chaque ordre est revalidé avant son
exécution ; une permission non prévue arrête la mission en sécurité.
`;

/** Public CLI surface. `_worker` is intentionally accepted but undocumented. */
export async function runOrchestrationCommand(argv: readonly string[], context: OrchestrationCliContext): Promise<CliExecution> {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  const command = `orchestration.${action ?? "unknown"}`;
  try {
    if (action === "help" || action === "--help" || action === "-h") return { code: 0, stdout: ORCHESTRATION_HELP, stderr: "" };
    if (action === undefined) throw new CliUsageError(`missing orchestration action\n\n${ORCHESTRATION_HELP}`);
    const args = parseStrictArguments(rest, argumentSpec(action));
    const management = createManagementRuntime({ homeDir: context.homeDir });
    const pipeline = createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir });
    const runtime = createOrchestrationRuntime({
      ...management,
      pipeline,
      homeDir: context.homeDir,
      frameworkRoot: context.frameworkRoot,
      ...(context.environment === undefined ? {} : { environment: context.environment }),
    });
    if (action === "_worker") {
      await runtime.runWorker({ projectId: required(args.values, "project"), executionId: required(args.values, "execution") });
      return { code: 0, stdout: "", stderr: "" };
    }
    const projectId = ProjectId.of(required(args.values, "project"));
    let data: unknown;
    switch (action) {
      case "configure":
        data = serializePolicy(await runtime.configure({
          projectId,
          selection: selectionFrom(args.values),
        }));
        break;
      case "preview":
        data = serializePreview(await runtime.preview({
          projectId,
          featureId: FeatureId.of(required(args.values, "feature")),
        }));
        break;
      case "start":
        data = serializeExecution(await runtime.start({
          projectId,
          featureId: FeatureId.of(required(args.values, "feature")),
          selection: selectionFrom(args.values),
          previewFingerprint: required(args.values, "preview"),
        }));
        break;
      case "status":
        data = serializeStatus(await runtime.status({ projectId }));
        break;
      case "cancel":
        data = serializeExecution(await runtime.cancel({ projectId, executionId: args.positionals[0]! }));
        break;
      case "approve":
        data = serializeExecution(await runtime.approve({ projectId, executionId: args.positionals[0]! }));
        break;
      case "retry":
        data = serializeExecution(await runtime.retry({ projectId, executionId: args.positionals[0]! }));
        break;
      default:
        throw new CliUsageError(`unknown orchestration action: ${action}`);
    }
    return output(command, data, json, action);
  } catch (error) {
    return failure(command, error, json);
  }
}

function argumentSpec(action: string): StrictArgumentSpec {
  const project = { project: "string" as const, json: "boolean" as const };
  const specs: Readonly<Record<string, StrictArgumentSpec>> = {
    configure: { options: { ...project, provider: "string", model: "string" }, minPositionals: 0, maxPositionals: 0 },
    preview: { options: { ...project, feature: "string" }, minPositionals: 0, maxPositionals: 0 },
    start: { options: { ...project, feature: "string", provider: "string", model: "string", preview: "string" }, minPositionals: 0, maxPositionals: 0 },
    status: { options: project, minPositionals: 0, maxPositionals: 0 },
    cancel: { options: project, minPositionals: 1, maxPositionals: 1 },
    approve: { options: project, minPositionals: 1, maxPositionals: 1 },
    retry: { options: project, minPositionals: 1, maxPositionals: 1 },
    _worker: { options: { project: "string", execution: "string" }, minPositionals: 0, maxPositionals: 0 },
  };
  return specs[action] ?? { options: project };
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new CliUsageError(`--${name} is required`);
  return value;
}

function selectionFrom(values: ReadonlyMap<string, string>): { readonly provider: "claude" | "codex" | "kimi" | "zai"; readonly model: string } {
  const provider = required(values, "provider");
  if (!isExecutionProvider(provider)) {
    throw new CliUsageError("--provider must be one of: claude, codex, kimi, zai");
  }
  return { provider, model: required(values, "model") };
}

function output(command: string, data: unknown, json: boolean, action: string): CliExecution {
  if (json) return { code: 0, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: true, data, errors: [], warnings: [] })}\n`, stderr: "" };
  if (action === "status") return { code: 0, stdout: `${humanStatus(data as ReturnType<typeof serializeStatus>)}\n`, stderr: "" };
  if (action === "configure") return { code: 0, stdout: `${humanPolicy(data as ReturnType<typeof serializePolicy>)}\n`, stderr: "" };
  if (action === "preview") return { code: 0, stdout: `${humanPreview(data as ReturnType<typeof serializePreview>)}\n`, stderr: "" };
  const execution = data as ReturnType<typeof serializeExecution>;
  return { code: 0, stdout: `Mission ${execution.id} · ${execution.status} · ${assistantLabel(execution.target.provider)} / ${execution.target.model ?? "ancienne configuration"}\n`, stderr: "" };
}

function failure(command: string, error: unknown, json: boolean): CliExecution {
  const message = error instanceof Error ? error.message : String(error);
  const code = errorCode(error);
  if (json) return { code, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" };
  return { code, stdout: "", stderr: `ERREUR — ${message}\n` };
}

function errorCode(error: unknown): number {
  if (error instanceof CliUsageError) return 64;
  if (error instanceof DomainError) {
    if (["PROJECT_NOT_FOUND", "PROJECT_MARKER_NOT_FOUND", "FEATURE_NOT_FOUND", "FEATURE_MARKER_NOT_FOUND", "FILE_NOT_FOUND"].includes(error.code)) return 4;
    if (["PROJECT_ALREADY_EXISTS", "FEATURE_ALREADY_EXISTS", "LOCK_CONFLICT"].includes(error.code)) return 5;
    if (["INVALID_PROJECT_ID", "INVALID_FEATURE_ID", "INVALID_PROJECT_OPTION", "INVALID_FEATURE_OPTION"].includes(error.code)) return 64;
    return 3;
  }
  return 3;
}

function serializeStatus(status: OrchestrationStatus) {
  return {
    schemaVersion: status.schemaVersion,
    projectId: status.projectId,
    orchestrationMode: status.orchestrationMode,
    policy: status.policy === undefined ? null : serializePolicy(status.policy),
    executions: status.executions.map(serializeExecution),
    activeExecution: status.activeExecution === undefined ? null : serializeExecution(status.activeExecution),
    latestExecution: status.latestExecution === undefined ? null : serializeExecution(status.latestExecution),
    actionRequired: status.actionRequired === undefined ? null : { ...status.actionRequired },
  };
}

function serializePolicy(policy: ExecutionPolicy) {
  return {
    schemaVersion: policy.schemaVersion,
    projectId: policy.projectId.value,
    selectionMode: policy.selectionMode,
    providers: policy.providers.map((provider) => ({
      provider: provider.provider,
      adapter: provider.adapter,
      enabled: provider.enabled,
      priority: provider.priority,
      capabilities: [...provider.capabilities],
      permissions: [...provider.permissions],
      models: provider.models.map((model) => ({ ...model })),
    })),
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

function serializeExecution(record: ExecutionRecord) {
  return {
    id: record.id,
    target: {
      provider: record.target.provider,
      adapter: record.target.adapter,
      ...(record.target.model === undefined ? {} : { model: record.target.model }),
      source: record.target.source,
    },
    provider: record.provider,
    status: record.status,
    order: {
      id: record.order.id,
      scope: {
        projectId: record.order.scope.projectId.value,
        ...(record.order.scope.featureId === undefined ? {} : { featureId: record.order.scope.featureId.value }),
        paths: [...record.order.scope.paths],
      },
      preconditions: { ...record.order.preconditions },
      requiredCapabilities: [...record.order.requiredCapabilities],
      requiredPermissions: [...record.order.requiredPermissions],
      summary: record.order.summary,
      issuedAt: record.order.issuedAt.toISOString(),
    },
    attempts: record.attempts.map((attempt) => ({
      number: attempt.number,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      ...(attempt.endedAt === undefined ? {} : { endedAt: attempt.endedAt.toISOString() }),
      ...(attempt.providerSessionId === undefined ? {} : { providerSessionId: attempt.providerSessionId }),
    })),
    events: record.events.map((event) => ({ at: event.at.toISOString(), type: event.type, detail: event.detail })),
    truncatedEventCount: record.truncatedEventCount,
    proofReferences: [...record.proofReferences],
    ...(record.suspensionReason === undefined ? {} : { suspensionReason: { ...record.suspensionReason } }),
    ...(record.providerSessionId === undefined ? {} : { providerSessionId: record.providerSessionId }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializePreview(preview: OrchestrationPreview) {
  return {
    schemaVersion: preview.schemaVersion,
    projectId: preview.projectId,
    featureId: preview.featureId,
    featureName: preview.featureName,
    stepId: preview.stepId,
    role: preview.role,
    summary: preview.summary,
    scopePaths: [...preview.scopePaths],
    requiredCapabilities: [...preview.requiredCapabilities],
    requiredPermissions: [...preview.requiredPermissions],
    candidates: preview.candidates.map((candidate) => ({
      target: {
        provider: candidate.target.provider,
        adapter: candidate.target.adapter,
        ...(candidate.target.model === undefined ? {} : { model: candidate.target.model }),
        source: candidate.target.source,
      },
      eligible: candidate.eligible,
      reasons: [...candidate.reasons],
      recommended: candidate.recommended,
    })),
    fingerprint: preview.fingerprint,
  };
}

function humanStatus(status: ReturnType<typeof serializeStatus>): string {
  const active = status.activeExecution ?? status.latestExecution;
  return [
    `Project ${status.projectId} · Pilote assisté ${status.orchestrationMode === "automatic" ? "activé" : "en pause"}`,
    `Assistants : ${status.policy === null ? "aucun modèle encore choisi" : status.policy.providers.flatMap((provider) => provider.models.filter((model) => model.enabled).map((model) => `${assistantLabel(provider.provider)} ${model.id}`)).join(", ") || "aucun modèle encore choisi"}`,
    `Mission : ${active === null ? "aucune" : `${active.id} · ${active.status} · ${assistantLabel(active.target.provider)} / ${active.target.model ?? "ancienne configuration"}`}`,
    `Action attendue : ${status.actionRequired === null ? "aucune" : `${status.actionRequired.kind} (${status.actionRequired.reason})`}`,
  ].join("\n");
}

function humanPolicy(policy: ReturnType<typeof serializePolicy>): string {
  const models = policy.providers.flatMap((provider) => provider.models
    .filter((model) => model.enabled)
    .map((model) => `${assistantLabel(provider.provider)} / ${model.id}`));
  return `Assistant mémorisé : ${models.join(", ") || "aucun"}`;
}

function humanPreview(preview: ReturnType<typeof serializePreview>): string {
  const assistants = preview.candidates.map((candidate) => {
    const availability = candidate.eligible ? "prêt" : candidate.reasons.join(", ");
    return `${assistantLabel(candidate.target.provider)} / ${candidate.target.model ?? "ancienne configuration"} : ${availability}`;
  });
  return [
    `Feature : ${preview.featureName}`,
    `Ce qui va être fait : ${preview.summary}`,
    `Assistant disponible : ${assistants.join(" · ") || "aucun"}`,
    `Empreinte à confirmer : ${preview.fingerprint}`,
  ].join("\n");
}

function assistantLabel(provider: "claude" | "codex" | "kimi" | "zai"): string {
  if (provider === "claude") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "kimi") return "Kimi Platform";
  return "Z.AI Coding Plan";
}
