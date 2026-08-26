# Migration to Norn 2.3.2 live framing

Norn 2.3.2 introduces framing before delivery pipelines. The migration is deliberately non-destructive: existing Feature markers and historical documents remain readable and continue on their original workflow.

## Existing Projects

No Project marker migration is required to start framing. From the Project root, run:

```bash
arka-norn framing enter .
```

Norn creates or resumes a Project framing plan under `$ARKA_NORN_HOME/framing`. It does not copy repository files, provider configuration, credentials, or chat history into that store.

## Existing v4 Features

Feature marker v4 is read as `legacy-2.0`. It keeps its selected historical pipeline and documents. Norn never adds a framing reference or changes the pipeline automatically.

To frame a new outcome alongside an existing Feature, create a separate not-yet-materialized target:

```bash
arka-norn framing enter . --new-feature "Expected outcome"
```

Use `--feature <existing-id>` only when the intention explicitly concerns that existing Feature.

## New v5 Features

A new Feature is created only after the grounded plan receives its second stabilization and is published. Its marker contains:

- `schemaVersion: 5`;
- `pipelineDefinitionVersion: 2.3`;
- the calculated 2.3 pipeline identifier;
- `framingPlanRef` with exact plan id, revision, fingerprint and relative path.

Downstream orchestration reloads that exact publication. Missing, changed, unpublished or snapshot-divergent plans block execution.

## Legacy framing documents

Existing v5 Concept, Plan and Feature Brief documents remain readable and importable as historical evidence. They no longer drive the new framing conversation. Norn does not delete or rewrite them.

## Agent skill

Regenerate or reinstall the main skill after upgrading:

```bash
arka-norn install --global
arka-norn skills doctor
```

The main `arka-norn` skill now enters or resumes live framing. Specialist delivery skills remain available when a published plan or historical pipeline assigns their exact phase.

## Recovery and rollback

The live plan is append-only and reconstructible. Removing a current pointer does not remove revision history; the store rebuilds the newest valid chain. Published revisions are immutable.

Rolling the package back does not mutate Project or Feature data. Older versions ignore the private framing store, but they cannot operate a marker v5 Feature whose exact 2.3 plan contract they do not understand. Restore Norn 2.3.2 or later before continuing such a Feature.
