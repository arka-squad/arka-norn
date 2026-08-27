# Norn 2.3 stability contract

Norn 2.3 fixes a small, stable vocabulary. These names do not change across a 2.3 release, and no synonym replaces them in the public CLI, TUI or Web surfaces. This document is the reference when a term is ambiguous.

## Stable concepts

Norn organizes delivery as **Project -> Plan -> Feature -> Lot -> Run**.

- **Project** is the tracked repository and its local Norn state. It owns Features, decisions, agents and published plans.
- **Plan** is the living framing artifact. One resumable plan frames a Project into Feature candidates, or a Feature into Lots. The plan, not the chat session, is the recovery source. Work in progress stays under `$ARKA_NORN_HOME/framing`; only a twice-stabilized revision is published under the Project's `.arka-norn/plans` directory.
- **Feature** is a bounded outcome with its own pipeline and documents. A new Feature is materialized only after its grounded plan is published.
- **Lot** is a bounded unit of a Feature plan, with read and write scopes, dependencies and functional, UX, code and security proofs. Lots are the input to orchestration.
- **Run** is one authorized execution of a Feature's Lots as a signed task DAG. A Run carries an execution profile per role, a confirmed plan fingerprint and an explicit application decision.

## Stable guarantees

- There are exactly two human stabilizations in framing. The first authorizes repository grounding. The second binds publication, decomposition and the calculated delivery route. No document, decomposition or Agent change adds a third.
- English is canonical for contracts and machine data. French is a locale projection, never the source of truth for a schema.
- Secrets, worktrees, campaigns and execution journals live under `$ARKA_NORN_HOME`, never in the product repository.
- A Run applies automatically only under the risk threshold, with no global denial, on an unchanged clean baseline, by fast-forward. Otherwise application is human.

## Legacy status

Legacy is readable, never the normal path.

- **Legacy 2.2 automatic campaigns** are inspection and import only. They are never resumed, retried or started. Importing a legacy policy yields disabled 2.3 profiles that require fresh credential resolution and a new preflight before activation.
- **Legacy v4 Features** keep their historical pipeline and documents. Norn never adds a framing reference or changes the pipeline automatically. Marker v4 is read as `legacy-2.0`.
- **Legacy v5 framing documents** (Concept, Plan, Feature Brief) remain readable and importable as historical evidence. They no longer drive the framing conversation and are never deleted or rewritten.

A superseded document is retained with its revision and its superseding reference. Norn keeps the older revision visible; it does not overwrite history.

## Migration notes

Upgrading to 2.3 changes behavior in three factual ways, each non-destructive:

1. Framing becomes a prerequisite outside the delivery pipelines, not a new step in front of them. Existing Features are unaffected until you frame a new outcome.
2. The automatic orchestration engine is a signed task DAG with per-task branches, worktrees, profiles, scopes and evidence. Prior automatic campaign state is quarantined and inspection-only.
3. New Features require a published `framingPlanRef`. Missing, changed, unpublished or snapshot-divergent plans block orchestration rather than running on stale input.

See [Migration to live framing](migration-2.3.2.md) for the exact commands.

