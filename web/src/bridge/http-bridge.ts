import type {
  AgentTrackingView,
  AuditTrackingView,
  AuditRunView,
  CreateGovernanceEventInput,
  FeatureTrackingView,
  GovernanceView,
  HumanDocumentView,
  LiveInvalidation,
  NornBridge,
  OrchestrationTrackingView,
  PrepareAuditInput,
  ProjectListItem,
  ProjectOverview,
  ProjectRelationshipGraph,
  WebPreferences,
} from "../../../src/application/web/contracts";

interface ApiEnvelope<T> {
  readonly schemaVersion: 2;
  readonly ok: boolean;
  readonly data: T;
  readonly errors: readonly { readonly code: string }[];
}

export class HttpNornBridge implements NornBridge {
  public constructor(private readonly token: string) {}

  public listProjects(): Promise<readonly ProjectListItem[]> { return this.request("/api/v1/projects"); }
  public getProject(projectId: string): Promise<ProjectOverview> { return this.request(`/api/v1/projects/${encode(projectId)}`); }
  public getFeature(projectId: string, featureId: string): Promise<FeatureTrackingView> { return this.request(`/api/v1/projects/${encode(projectId)}/features/${encode(featureId)}`); }
  public getDocument(projectId: string, featureId: string, documentId: string): Promise<HumanDocumentView> { return this.request(`/api/v1/projects/${encode(projectId)}/features/${encode(featureId)}/documents/${encode(documentId)}`); }
  public getGraph(projectId: string, featureId?: string): Promise<ProjectRelationshipGraph> {
    const query = featureId === undefined ? "" : `?featureId=${encode(featureId)}`;
    return this.request(`/api/v1/projects/${encode(projectId)}/graph${query}`);
  }
  public getGovernance(projectId: string): Promise<GovernanceView> { return this.request(`/api/v1/projects/${encode(projectId)}/governance`); }
  public getAgents(projectId: string): Promise<readonly AgentTrackingView[]> { return this.request(`/api/v1/projects/${encode(projectId)}/agents`); }
  public getAudits(projectId: string): Promise<readonly AuditTrackingView[]> { return this.request(`/api/v1/projects/${encode(projectId)}/audits`); }
  public getAudit(projectId: string, auditId: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}`); }
  public prepareAudit(projectId: string, input: PrepareAuditInput): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/prepare`, "POST", input); }
  public startAudit(projectId: string, auditId: string, confirmation: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}/start`, "POST", { confirmation }); }
  public finalizeAudit(projectId: string, auditId: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}/finalize`, "POST", {}); }
  public cancelAudit(projectId: string, auditId: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}/cancel`, "POST", {}); }
  public resumeAudit(projectId: string, auditId: string): Promise<AuditRunView> { return this.request(`/api/v1/projects/${encode(projectId)}/audits/${encode(auditId)}/resume`, "POST", {}); }
  public getOrchestrations(projectId: string): Promise<readonly OrchestrationTrackingView[]> { return this.request(`/api/v1/projects/${encode(projectId)}/orchestrations`); }
  public getPreferences(): Promise<WebPreferences> { return this.request("/api/v1/preferences"); }
  public savePreferences(input: { readonly locale?: "auto" | "en" | "fr"; readonly name?: string; readonly email?: string }): Promise<WebPreferences> { return this.request("/api/v1/preferences", "PUT", input); }
  public pickFolder(input: { readonly purpose: "project" | "feature"; readonly defaultPath?: string }): Promise<string | null> { return this.request("/api/v1/folder-picker", "POST", input); }
  public createProject(input: { readonly id: string; readonly name: string; readonly root: string }): Promise<ProjectOverview> { return this.request("/api/v1/projects", "POST", input); }
  public createFeature(projectId: string, input: { readonly id: string; readonly name: string; readonly root: string; readonly pipelineId?: string }): Promise<FeatureTrackingView> { return this.request(`/api/v1/projects/${encode(projectId)}/features`, "POST", input); }
  public appendGovernance(projectId: string, input: CreateGovernanceEventInput): Promise<GovernanceView> { return this.request(`/api/v1/projects/${encode(projectId)}/governance`, "POST", input); }
  public inspectDoctor(): Promise<unknown> { return this.request("/api/v1/doctor"); }
  public repairDoctor(input: { readonly apply: boolean; readonly confirmed: boolean }): Promise<unknown> { return this.request("/api/v1/doctor/repair", "POST", input); }

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
    const envelope = await response.json() as ApiEnvelope<T>;
    if (!response.ok || !envelope.ok) throw new BridgeError(response.status, envelope.errors[0]?.code ?? "request_failed");
    return envelope.data;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "Accept-Language": document.documentElement.lang || navigator.language };
  }
}

export class BridgeError extends Error {
  public constructor(public readonly status: number, public readonly code: string) { super(code); }
}

function encode(value: string): string { return encodeURIComponent(value); }
