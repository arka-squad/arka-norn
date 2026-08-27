import type {
  AgentMutationInput,
  AgentRegistryView,
  AuditTrackingView,
  AuditRunView,
  CreateGovernanceEventInput,
  FeatureContinuationView,
  FeatureTrackingView,
  FramingDetailView,
  FramingSummaryView,
  GovernanceView,
  HumanDocumentView,
  LiveInvalidation,
  NornBridge,
  OrchestrationTrackingView,
  PrepareAuditInput,
  ProductPromptTarget,
  ProductPromptView,
  ProjectListItem,
  ProjectOverview,
  ProjectRelationshipGraph,
  SaveWebPreferencesInput,
  WebPreferences,
} from "../../../src/application/web/contracts";
import type { CapabilityCatalog } from "../../../src/application/capabilities/capability-registry";
import type { DoctorInspectionReport, DoctorRepairOutcome, DoctorRepairPlan } from "../../../src/ports/inbound/for-doctor";

interface ApiEnvelope<T> {
  readonly schemaVersion: 2;
  readonly ok: boolean;
  readonly data: T;
  readonly errors: readonly { readonly code: string }[];
}

export class HttpNornBridge implements NornBridge {
  public constructor(private readonly token: string) {}

  public getCapabilities(): Promise<CapabilityCatalog> { return this.request("/api/v1/capabilities"); }
  public listProjects(): Promise<readonly ProjectListItem[]> { return this.request("/api/v1/projects"); }
  public enterProjectFraming(input: { readonly root: string }): Promise<ProjectOverview> { return this.request("/api/v1/framing/enter", "POST", input); }
  public getProject(projectId: string): Promise<ProjectOverview> { return this.request(`/api/v1/projects/${encode(projectId)}`); }
  public setProjectOrchestrationMode(projectId: string, input: { readonly mode: "manual" | "automatic"; readonly expectedUpdatedAt: string }): Promise<ProjectOverview> { return this.request(`/api/v1/projects/${encode(projectId)}/orchestration-mode`, "PUT", input); }
  public getFeature(projectId: string, featureId: string): Promise<FeatureTrackingView> { return this.request(`/api/v1/projects/${encode(projectId)}/features/${encode(featureId)}`); }
  public listFramings(projectId: string): Promise<readonly FramingSummaryView[]> { return this.request(`/api/v1/projects/${encode(projectId)}/framing`); }
  public getFraming(projectId: string, framingId: string): Promise<FramingDetailView> { return this.request(`/api/v1/projects/${encode(projectId)}/framing/${encode(framingId)}`); }
  public startFraming(projectId: string, input: { readonly existingFeatureId?: string; readonly newFeatureTitle?: string }): Promise<FramingDetailView> { return this.request(`/api/v1/projects/${encode(projectId)}/framing`, "POST", input); }
  public getFeatureContinuation(projectId: string, featureId: string): Promise<FeatureContinuationView> { return this.request(`/api/v1/projects/${encode(projectId)}/features/${encode(featureId)}/continuation`); }
  public prepareProductPrompt(projectId: string, featureId: string, input: { readonly target: ProductPromptTarget; readonly purpose: "next_step" | "resume" }): Promise<ProductPromptView> { return this.request(`/api/v1/projects/${encode(projectId)}/features/${encode(featureId)}/product-prompt`, "POST", input); }
  public getDocument(projectId: string, featureId: string, documentId: string): Promise<HumanDocumentView> { return this.request(`/api/v1/projects/${encode(projectId)}/features/${encode(featureId)}/documents/${encode(documentId)}`); }
  public getGraph(projectId: string, featureId?: string): Promise<ProjectRelationshipGraph> {
    const query = featureId === undefined ? "" : `?featureId=${encode(featureId)}`;
    return this.request(`/api/v1/projects/${encode(projectId)}/graph${query}`);
  }
  public getGovernance(projectId: string): Promise<GovernanceView> { return this.request(`/api/v1/projects/${encode(projectId)}/governance`); }
  public getAgents(projectId: string): Promise<AgentRegistryView> { return this.request(`/api/v1/projects/${encode(projectId)}/agents`); }
  public registerAgent(projectId: string, input: AgentMutationInput): Promise<AgentRegistryView> { return this.request(`/api/v1/projects/${encode(projectId)}/agents`, "POST", input); }
  public selectAgent(projectId: string, agentId: string, input: { readonly sessionId: string; readonly expectedRegistryRevision: number }): Promise<AgentRegistryView> { return this.request(`/api/v1/projects/${encode(projectId)}/agents/${encode(agentId)}/select`, "POST", input); }
  public replaceAgent(projectId: string, agentId: string, input: AgentMutationInput): Promise<AgentRegistryView> { return this.request(`/api/v1/projects/${encode(projectId)}/agents/${encode(agentId)}/replace`, "POST", input); }
  public deactivateAgent(projectId: string, agentId: string, input: { readonly expectedRegistryRevision: number; readonly confirmation: string }): Promise<AgentRegistryView> { return this.request(`/api/v1/projects/${encode(projectId)}/agents/${encode(agentId)}/deactivate`, "POST", input); }
  public getAudits(projectId: string): Promise<readonly AuditTrackingView[]> { return this.request(`/api/v1/projects/${encode(projectId)}/audits`); }
  public getAudit(projectId: string, auditId: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}`); }
  public prepareAudit(projectId: string, input: PrepareAuditInput): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/prepare`, "POST", input); }
  public startAudit(projectId: string, auditId: string, confirmation: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}/start`, "POST", { confirmation }); }
  public finalizeAudit(projectId: string, auditId: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}/finalize`, "POST", {}); }
  public cancelAudit(projectId: string, auditId: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}/cancel`, "POST", {}); }
  public resumeAudit(projectId: string, auditId: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}/resume`, "POST", {}); }
  public getOrchestrations(projectId: string): Promise<readonly OrchestrationTrackingView[]> { return this.request(`/api/v1/projects/${encode(projectId)}/orchestrations`); }
  public getPreferences(): Promise<WebPreferences> { return this.request("/api/v1/preferences"); }
  public savePreferences(input: SaveWebPreferencesInput): Promise<WebPreferences> { return this.request("/api/v1/preferences", "PUT", input); }
  public pickFolder(input: { readonly purpose: "project" | "feature"; readonly defaultPath?: string }): Promise<string | null> { return this.request("/api/v1/folder-picker", "POST", input); }
  public createProject(input: { readonly id: string; readonly name: string; readonly root: string }): Promise<ProjectOverview> { return this.request("/api/v1/projects", "POST", input); }
  public createFeature(projectId: string, input: { readonly id: string; readonly name: string; readonly root: string; readonly pipelineId?: string }): Promise<FeatureTrackingView> { return this.request(`/api/v1/projects/${encode(projectId)}/features`, "POST", input); }
  public appendGovernance(projectId: string, input: CreateGovernanceEventInput): Promise<GovernanceView> { return this.request(`/api/v1/projects/${encode(projectId)}/governance`, "POST", input); }
  public inspectDoctor(): Promise<DoctorInspectionReport> { return this.request("/api/v1/doctor"); }
  public previewDoctorRepairs(): Promise<DoctorRepairPlan> { return this.request("/api/v1/doctor/repair-preview", "POST", {}); }
  public applyDoctorRepairs(input: { readonly fingerprint: string; readonly confirmed: boolean }): Promise<DoctorRepairOutcome> { return this.request("/api/v1/doctor/repair-apply", "POST", input); }

  public async subscribe(listener: (event: LiveInvalidation) => void, signal?: AbortSignal): Promise<void> {
    const response = await fetch("/api/v1/events", { headers: this.headers(), ...(signal === undefined ? {} : { signal }) });
    if (!response.ok || response.body === null) throw new BridgeError(response.status, "live_stream_unavailable");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      buffer += result.value;
      const messages = buffer.split("\n\n");
      buffer = messages.pop() ?? "";
      for (const message of messages) {
        const line = message.split("\n").find((candidate) => candidate.startsWith("data: "));
        if (line !== undefined) listener(JSON.parse(line.slice(6)) as LiveInvalidation);
      }
    }
  }

  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(path, {
      method,
      headers: { ...this.headers(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const envelope = await response.json() as ApiEnvelope<T> & { readonly display?: { readonly message?: string }; readonly errors: readonly { readonly code: string; readonly params?: Readonly<Record<string, unknown>> }[] };
    if (!response.ok || !envelope.ok) throw new BridgeError(response.status, envelope.errors[0]?.code ?? "request_failed", envelope.display?.message ?? "", envelope.errors[0]?.params ?? {});
    return envelope.data;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "Accept-Language": document.documentElement.lang || navigator.language };
  }
}

export class BridgeError extends Error {
  public constructor(public readonly status: number, public readonly code: string, public readonly displayMessage = "", public readonly details: Readonly<Record<string, unknown>> = {}) { super(displayMessage || code); }
}

function encode(value: string): string { return encodeURIComponent(value); }
