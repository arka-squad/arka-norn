import type { AgentSessionId } from "../../domain/agent/agent-session-id.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export type OrchestratedAgentRole = "product" | "architecte" | "audit" | "dev" | "qa";
export type AgentWorkMode = "execute" | "prepare";

export interface AgentRoleRecommendation {
  readonly role: OrchestratedAgentRole;
  readonly mode: AgentWorkMode;
  readonly canWrite: boolean;
  readonly sessionId: string;
  readonly skill: string;
  readonly skillProfile: string;
  readonly reason: string;
  readonly command: string;
}

export interface AgentOrchestrationAdvice {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly featureId?: string;
  readonly pipelineId?: string;
  readonly phase: string;
  readonly nextStepId?: string;
  readonly productPrincipal: {
    readonly sessionId: "main";
    readonly status: "ready" | "unbound" | "missing" | "conflict";
    readonly agentId?: string;
    readonly reason: string;
  };
  readonly productNextAction: string;
  readonly recommendations: readonly AgentRoleRecommendation[];
  readonly handoffPromptCommand: string;
  readonly warnings: readonly string[];
}

export interface AgentInitializationPrompt {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly featureId?: string;
  readonly role: OrchestratedAgentRole;
  readonly mode: AgentWorkMode;
  readonly sessionId: string;
  readonly skill: string;
  readonly skillProfile: string;
  /** Commande idempotente à exécuter par le Product avant d'ouvrir la session provider. */
  readonly preflightCommand: string;
  readonly canWrite: boolean;
  readonly expectedStepId?: string;
  readonly prompt: string;
}

export interface ProductHandoffPrompt {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly featureId?: string;
  readonly sessionId: "main";
  readonly agentId: string;
  readonly prompt: string;
}

export interface ForAgentOrchestration {
  advise(input: { readonly projectId: ProjectId; readonly featureId?: FeatureId }): Promise<AgentOrchestrationAdvice>;
  initializationPrompt(input: {
    readonly projectId: ProjectId;
    readonly featureId?: FeatureId;
    readonly role: OrchestratedAgentRole;
    readonly provider?: string;
    readonly sessionId?: AgentSessionId;
    readonly mode?: AgentWorkMode;
  }): Promise<AgentInitializationPrompt>;
  productHandoffPrompt(input: {
    readonly projectId: ProjectId;
    readonly featureId?: FeatureId;
    readonly agentId?: string;
  }): Promise<ProductHandoffPrompt>;
}
