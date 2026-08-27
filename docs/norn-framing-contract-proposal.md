# Norn framing engine contract

This document is the implementation contract for the Norn 2.3 live framing engine. The Product and UX rationale is maintained in [norn-framing-method-research.md](./norn-framing-method-research.md). The original French design notes are retained under `docs/legacy/fr/` for traceability.

## Outcome

Framing is a service that runs before delivery pipelines. It maintains one resumable `FramingPlan` for either a Project or a Feature:

- a Project plan produces Feature candidates;
- a Feature plan produces executable Lots;
- technical tasks remain internal to Lots.

The plan is updated in the background from the first useful exchange. It is the durable memory of the work; chat sessions and providers are transports only. A framing journey contains exactly two human stabilizations:

1. authorize repository grounding and technical confrontation;
2. bind and publish the exact grounded plan revision.

No document, worker, provider change, or recovery step adds a third gate.

## System boundary

```text
connected Agent
      |
      v
framing enter/resume ----> live FramingPlan revisions
      |                            |
      v                            v
deterministic probe       local PlanDelta broker
      |                            |
      +------ grounding -----------+
                    |
                    v
           signed published plan
              /             \
     Project Features     Feature Lots
                              |
                              v
                     delivery orchestration
```

The framing engine never pretends to execute delivery. The pipeline engine no longer reconstructs framing from missing documents; a 2.3 Feature points to one exact published plan revision.

## Public contracts

The canonical runtime types live in [`src/domain/framing/framing-plan.ts`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/src/domain/framing/framing-plan.ts). JSON Schema consumers use:

- [`schemas/framing-plan.schema.json`](../schemas/framing-plan.schema.json);
- [`schemas/framing-delta.schema.json`](../schemas/framing-delta.schema.json);
- [`schemas/repository-probe.schema.json`](../schemas/repository-probe.schema.json);
- [`schemas/framing-resume-packet.schema.json`](../schemas/framing-resume-packet.schema.json);
- [`schemas/feature-marker.schema.json`](../schemas/feature-marker.schema.json).

### FramingTarget

`FramingTarget` is a discriminated union:

- Project: `projectId` and stable `framingId`;
- existing Feature: Project fields, `origin: existing`, and `featureId`;
- new Feature: `origin: new`, `featureId: null`, and a working title.

A new Feature is not materialized when framing starts. Its `framingId` provides a stable recovery identity before a final identifier, folder, or pipeline can be selected legitimately.

### RepositoryProbe

`RepositoryProbe` classifies the scoped repository as:

- `empty`;
- `skeleton`;
- `implemented`;
- `indeterminate`.

It records exact inventory counters, ignored roots, access and truncation signals, Git state, a content-based workspace snapshot, and a separate inventory fingerprint. The probe is deterministic and never calls a model or provider.

### FramingPlan

`FramingPlan` contains:

- target and content locale;
- repository probe and snapshot;
- revision lineage and semantic fingerprint;
- knowledge grouped into fixed semantic sections;
- Project-to-Feature or Feature-to-Lot decomposition;
- the two stabilization records;
- optional immutable publication metadata;
- controller-derived authority, grounding, attention, next action, and recommended pipeline.

The model cannot write derived state, stabilization records, publication authority, or fingerprints. [`assertPlan`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/src/domain/framing/framing-plan.ts) recomputes and verifies those fields after every read and mutation.

### KnowledgeItem

Each knowledge item has a stable identifier, statement, provenance, dependency references, and active or superseded status. Provenance is one of:

- `human_decision`;
- `agent_deduction`;
- `source_fact`;
- `inventory_fact`;
- `technical_design`;
- `recommendation`;
- `open`.

Model deductions are visible and correctable. Positive source facts require the current snapshot plus `path:line`. Absence claims require the probe inventory attestation. Correcting a premise supersedes only dependent conclusions.

### PlanDelta

The Agent submits elementary operations against a mandatory `baseRevision`; it never rewrites a complete plan. Supported operations add or supersede knowledge, resolve decisions, and propose a decomposition. Unknown fields and malformed operations are rejected before mutation by [`framing-delta-validation.ts`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/src/domain/framing/framing-delta-validation.ts).

Disjoint stale operations may merge. A stale mutation of the same semantic key is never last-write-wins: alternatives and a blocking open contradiction are preserved for confrontation.

### FramingAction

The controller calculates the immediate action and attention owner. Attention is one of:

- `agent`;
- `human_substance`;
- `human_stabilization`;
- `worker`;
- `complete`;
- `recoverable_failure`.

An Agent continues while it can infer safely. It asks one open question only when continuing would invent human substance. The action becomes a human stabilization only at the two contract boundaries.

### FramingResumePacket

The resume packet transports the plan identity, current revision and fingerprint, human summary, immediate next move, and a bounded expurgated context. It contains neither a full conversation nor provider credentials. A packet is stale as soon as its revision no longer matches the store.

## Repository behavior

The adapter in [`fs-repository-probe.ts`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/src/adapters/outbound/filesystem/fs-repository-probe.ts) counts files independently of bounded display samples and ignores build outputs, dependencies, Git metadata, Norn metadata, and GitNexus caches.

Behavior depends on repository nature:

- `empty`: no audit or blind reader; produce explicitly greenfield technical design;
- `skeleton`: read manifests and declared constraints only;
- `implemented`: perform a first intent-blind reading of structure and public surfaces, then confront findings with Product intent;
- `indeterminate`: reduce authority and avoid broad positive or negative claims.

Symlinks, submodules, access failures, scope escape, and truncated inventory are explicit signals. A blind worker may run only through an enabled `ExecutionProfile` 2.3 after its exact preflight succeeds. Provider and model fallback is forbidden.

## Persistence and recovery

[`fs-framing-store.ts`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/src/adapters/outbound/filesystem/fs-framing-store.ts) stores mutable work outside the product repository:

```text
$ARKA_NORN_HOME/framing/<project>/<framing-id>/
|-- current.json
|-- revisions/<revision>-<sha256>.json
`-- events/<sequence>-<sha256>.json
```

Every event and revision is immutable. Writes use temporary files and atomic renames. `current.json` is a rebuildable projection, not the source of truth. On interruption between event, revision, and pointer writes, recovery selects the newest valid chained revision and repairs only the pointer.

The store never persists conversation transcripts, secrets, provider homes, or repository files. An Agent may claim that work is recorded only after the store returns the committed revision.

After the second stabilization, publication writes a signed immutable copy under:

```text
<project>/.arka-norn/plans/<framing-id>/<revision>-<fingerprint>.json
```

The index is reconstructible from signed publications. Publication re-probes the repository and fails if the grounded snapshot diverged.

## Stabilization semantics

### Intent stabilization

The first stabilization is available only after problem, desired effects, and exact objective contain human-grounded substance. It authorizes technical grounding. Later discussion may correct the intent without repeating this stabilization.

### Grounded plan stabilization

The second stabilization binds the current semantic fingerprint, grounded evidence or qualified greenfield design, coherent decomposition, risks, and calculated pipeline. Any post-stabilization semantic mutation invalidates publication and must return through the same journey; it does not create another type of gate.

## Decomposition

Project and Feature framing share all prior states. They differ only at the final decomposition boundary.

### ProjectFeatureDecomposition

Each candidate Feature has an independent observable outcome, inclusions, exclusions, dependencies, and cohesion rationale. Publication never creates every candidate automatically. Materialization remains an explicit later choice.

### FeatureLotDecomposition

Each Lot has an objective, observable effect, read and write scopes, dependencies, and functional, UX, code, and security proofs. Lots form a DAG. Circular dependencies, unknown dependencies, duplicate scopes, and empty proof categories are rejected.

A Feature that contains several independently adoptable outcomes must be split. Lots may be technically complex, but they cannot conceal another Product Feature.

## CLI and broker

The public read surface is:

```text
arka-norn framing enter [path] --json
arka-norn framing show [target] --view summary|plan|evidence|map --json
arka-norn framing resume [target] --json
```

Mutations, stabilizations, and publication use the private `_broker` namespace. The public Agent skill is generated from [`skills-src/arka-norn.json`](../skills-src/arka-norn.json). It enters from the current folder, resumes from the plan, exposes deductions, and never requires a Feature, identity, workflow, or old session as an entry ticket.

## Pipeline compatibility

Feature marker v5 adds `pipelineDefinitionVersion` and an exact `framingPlanRef`. Marker v4 remains readable as `legacy-2.0` and is never migrated silently.

New 2.3 pipelines are defined in:

- [`pipelines/arka-norn-essential-2.3.json`](../pipelines/arka-norn-essential-2.3.json);
- [`pipelines/arka-norn-complete-2.3.json`](../pipelines/arka-norn-complete-2.3.json).

They begin after framing. [`orchestration-v23-plan-builder.ts`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/src/composition/orchestration-v23-plan-builder.ts) accepts only an exact, signed, grounded Feature plan and maps its Lots to task plans. A missing, tampered, unpublished, or divergent plan blocks orchestration.

## Web projection

Norn Web is a human projection of the same plan, not a competing chat. Project pages prioritize active framing. Feature pages show the intended outcome before pipeline internals. Plan, Evidence, Map, and History views render localized human labels and structured content; raw JSON and primary enum labels are forbidden.

Starting a new Feature asks for the outcome only. Resume uses the active Agent profile, an explicit profile change, or a copyable expurgated packet. The old identity-to-workflow wizard is no longer an entry gate.

## Security invariants

- Work in progress stays under `$ARKA_NORN_HOME`; only signed publication enters a product repository.
- The probe never follows symlinks or submodules and never leaves declared scope.
- Secrets and provider configuration are not copied into plans or resume packets.
- Derived authority cannot be supplied by an Agent or model.
- Every source assertion is bound to a snapshot and exact location.
- No silent provider, model, scope, budget, or pipeline fallback is permitted.
- Automatic orchestration cannot start from a non-published or divergent revision.

## Verification anchors

The primary regression suites are:

- [`tests/unit/framing-plan.test.ts`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/tests/unit/framing-plan.test.ts);
- [`tests/integration/framing-engine.test.ts`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/tests/integration/framing-engine.test.ts);
- [`tests/e2e/framing-cli.test.ts`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/tests/e2e/framing-cli.test.ts);
- [`web/src/views/framing-view.test.tsx`](https://github.com/arka-squad/arka-norn/blob/v2.3.2/web/src/views/framing-view.test.tsx).

They cover repository classification, crash recovery, concurrency, exact two-gate behavior, local invalidation, Feature materialization, publication integrity, orchestration linkage, and human Web rendering.
