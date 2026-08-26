# Norn framing method: Product and UX rationale

This document explains the method behind the Norn 2.3 framing engine. The executable contract is maintained in [norn-framing-contract-proposal.md](./norn-framing-contract-proposal.md). The original French working notes remain under `docs/legacy/fr/`.

## Product premise

The concrete entry point to Norn is not a pipeline or a document. It is the moment a person tries to turn an intention into a buildable Project or Feature.

Norn therefore starts from the current folder and asks what outcome the user wants. It then determines whether the folder is empty, skeletal, implemented, or impossible to assess reliably. A Project and a Feature use the same framing method:

- Project framing ends with Feature candidates;
- Feature framing ends with Lots;
- tasks remain an implementation detail of a Lot.

This hierarchy prevents both extremes: a giant catch-all Feature and an administrative explosion of tiny documents or gates.

## The plan is the memory

The key design correction is that the concept is not a package handed from one Agent to another. It is the earliest epistemic state of the plan.

Before code reading, the plan may contain the problem, effects, rules, capabilities, Product decisions, and explicit unknowns. It may not assert files, architecture, or existing behavior. Technical grounding enriches the same plan; it does not replace it with another document.

Every useful exchange writes a local delta in the background. The durable plan enables:

- interruption without loss of the exact front;
- provider or Agent changes without reconstructing a chat;
- visible, correctable deductions;
- provenance per assertion;
- invalidation of dependent conclusions only;
- publication of one exact revision for downstream work.

Chat history is too provider-specific, verbose, and fragile to serve as governance state. Norn stores the decision model, not the conversation transcript.

## Conversation pattern

### 1. The Agent opens

The Agent states its current understanding in ordinary language. The user corrects it. The Agent does not begin with identifiers, folders, workflows, or document names that Norn can calculate.

### 2. The Agent conducts

Each turn adds substance to the plan. Deductions are stated inside the continuing discussion so they can be corrected. The Agent keeps moving unless one of three conditions occurs:

- continuing would invent human intent;
- two statements contradict each other materially;
- a decision would freeze authority at a stabilization boundary.

Questions are open and anchored in the unresolved substance. A string of closed questions gives the user the sensation of configuring software rather than being guided through a Project.

### 3. Intent stabilization

When problem, desired effects, and exact objective are sufficiently clear, the Agent announces that technical grounding can begin. Human confirmation authorizes the probe and confrontation. It does not make the intention immutable.

### 4. Background assembly

The controller continuously stores and recalculates the live plan. This is not a new user-facing phase and requires no confirmation.

### 5. Reality reading

Technical grounding is selected by repository nature. On implemented code, the first reader is intentionally blind to Product intent so it reports existing structure rather than rationalizing the proposed solution. It then receives the intent for targeted confrontation.

### 6. Confrontation

The Agent explains what already exists, what conflicts, what can be reused, what remains unknown, and which design is feasible. Discussion continues in the same journey. Corrections update the same plan.

### 7. Grounded plan stabilization

The Agent announces that the exact grounded plan, decomposition, proofs, and selected delivery route are ready. The second confirmation binds the revision.

### 8. Publication and delivery

Norn publishes the exact plan and either exposes Project Feature candidates or materializes the directly framed Feature. Delivery pipelines consume the publication; they do not rerun framing.

## Exactly two stabilizations

The method deliberately limits explicit gates:

1. authorize confrontation with reality;
2. authorize publication of the grounded plan.

More gates create procedural drag and distribute decisions across artifacts. Fewer gates would let the system inspect or publish without clear human authority. Provider choice, document generation, worker changes, recovery, and UI navigation do not create additional stabilizations.

The controller owns the gate count. A model cannot mark a stabilization as complete or manufacture a third one.

## Repository-sensitive grounding

### Empty

An empty repository contains no implementation to audit. Running a code audit produces ritual activity and false authority. Norn records an inventory attestation and moves directly to explicitly greenfield design.

### Skeleton

A skeleton contains constraints but not a meaningful implementation. Norn reads manifests, toolchain files, public configuration, and explicit constraints. It avoids broad architectural claims.

### Implemented

An implemented repository justifies a separate technical reading. The first pass observes structure and public surfaces without seeing Product intent. The second pass confronts those facts with the desired outcome. Positive facts require `file:line` evidence bound to a snapshot.

### Indeterminate

Incomplete access, truncated inventory, unsafe links, or an unstable baseline reduce authority. Norn reports what prevented observation and offers a recovery route. It does not translate uncertainty into absence.

## Guidance without a gate factory

The experience should continuously show four things:

- the user outcome;
- the current understanding;
- what Norn is doing now;
- the immediate next move.

The system should perform safe inferences and display them rather than ask permission for every micro-decision. It asks only when the missing substance belongs to the user. This preserves a feeling of conducted progress while keeping important decisions correctable.

Anti-factory rules are structural:

- one document exists only when a named consumer needs it;
- one section exists only when its absence blocks downstream work;
- point to evidence instead of copying it;
- incomplete evidence reduces authority instead of blocking all progress;
- discussion resolves decisions; documents record them;
- no step is added merely because an Agent or provider changed;
- the early concept projection is disposable once the grounded plan exists.

## Cohesion and decomposition

### Project to Features

A Feature is a result that can be understood, validated, and adopted independently. Two proposed outcomes belong in different Features when one can provide value without the other or when their release decisions can differ.

Project publication creates a map of candidates, not a batch of repository resources. Creating every candidate immediately would turn framing into backlog inflation.

### Feature to Lots

A Lot is a bounded delivery slice contributing to one Feature outcome. It owns scopes, dependencies, and proofs. A Lot may be technically deep, but it is not allowed to hide another independently adoptable Product outcome.

The decomposition must answer:

- what becomes observable after this slice;
- what it may read and write;
- what must exist first;
- how Product, UX, code, and security correctness will be demonstrated.

Technical tasks are generated inside Lots only after publication. Users should not navigate a task graph while still deciding what they are building.

## UX and navigation

Norn Web accompanies the connected Agent; it is not a second chat.

The Project overview prioritizes a “framing in progress” card when work exists. A Feature page leads with the intended result before pipeline status. The framing route exposes four human views:

- Plan: current meaning and decisions;
- Evidence: repository nature, inventory, claims, and limitations;
- Map: Feature candidates or Lots and dependencies;
- History: immutable revisions and stabilizations.

The primary interface never exposes raw JSON or internal enum values. Advanced transport remains available through the copyable resume packet. Mobile and keyboard users must reach every destination without a horizontal navigation rail.

Starting a new Feature asks for the outcome only. Norn calculates the identifier, folder, and pipeline after grounding. Resuming means locating the plan, not locating an old Product chat.

## Robustness principles

### Local correction

Plan mutations are elementary. Correcting one decision invalidates only assertions that declare a dependency on it. The Agent never regenerates the entire plan from prose and silently drops unrelated decisions.

### Concurrency

Every delta names the revision it read. Disjoint stale deltas can merge. Competing values for the same key remain visible as alternatives and create one contradiction to resolve. Last-write-wins is inappropriate for Product decisions.

### Recovery

Events and revisions are immutable; the current pointer is reconstructible. After a crash, Norn resumes from the newest valid chain and reports any recoverable write gap. It never relies on provider memory.

### Provider independence

The plan contains no credentials, provider home, or secret. Technical workers run through explicit Execution Profiles and exact preflights. If a provider is unavailable, Norn preserves the plan and offers recovery or an expurgated handoff; it does not silently substitute another model.

## External methods considered

The method borrows individual principles without importing a complete ceremony:

- **Double Diamond** contributes deliberate divergence and convergence, but Norn avoids four named user-facing phases.
- **Shape Up** contributes appetite, boundaries, risks, and shaped work, but a fixed betting cycle is outside the framing engine.
- **User Story Mapping** contributes outcome-oriented decomposition and navigable slices, but Norn does not require a workshop board.
- **Example Mapping and BDD** contribute rules, examples, and unresolved questions tied to observable behavior, but syntax is deferred until a downstream consumer needs it.
- **Google PAIR and Microsoft Human-AI Interaction Guidelines** contribute expectation setting, progressive control, correction, and recovery.
- **Anthropic agent design guidance** contributes simple composable workflows, bounded delegation, tool feedback, and explicit stopping conditions.

Useful primary references:

- [UK Design Council, the Double Diamond](https://www.designcouncil.org.uk/our-resources/the-double-diamond/)
- [Shape Up by Basecamp](https://basecamp.com/shapeup)
- [Cucumber, Example Mapping](https://cucumber.io/blog/bdd/example-mapping-introduction/)
- [Google PAIR Guidebook](https://pair.withgoogle.com/guidebook/)
- [Microsoft Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/)
- [Anthropic, Building effective agents](https://www.anthropic.com/research/building-effective-agents)

## Adopted and rejected patterns

Adopted:

- a continuously visible, revisable frame;
- explicit uncertainty and provenance;
- outcome-first decomposition;
- repository-sensitive evidence;
- exactly two authority boundaries;
- recovery independent of chat history;
- bounded worker delegation.

Rejected:

- audit as a universal first step;
- one generated document per conversational phase;
- mandatory Feature, workflow, or identity before Product intent;
- silent model fallback;
- auto-creation of a Project backlog;
- full-plan rewrites after each answer;
- a third confirmation for publication mechanics.

## Product success criteria

The method succeeds when a non-technical user can:

- start from an empty or existing folder without learning Norn internals;
- understand what Norn believes and correct it immediately;
- leave and resume with another Agent at the exact decision front;
- experience only two meaningful confirmations;
- receive a Project Feature map or Feature Lot plan without a catch-all scope;
- see evidence and limitations in human form;
- move into delivery from one exact, trustworthy publication.

Speed alone is insufficient. The desired sensation is reliable conduct: Norn keeps the work moving, exposes its reasoning, protects authority, and always shows where the Project stands.
