# arka.norn

> Norn turns a conversation with an Agent into a living plan, then that plan into a bounded, traceable local delivery — without making the chat the source of truth.

Install Norn, open your Agent, and start framing:

```bash
npm install -g arka-norn
arka-norn setup
```

Then open Codex or Claude Code in your folder and run `/arka-norn`.

**Day-one win:** Norn keeps a living plan, its decisions and its next action. Docker and execution profiles are not required to frame a Project or Feature.

arka.norn is a local Project tracking and delivery framework for Features, published documents, human decisions, evidence and auditable workflows. `arka-norn` is its command. It provides a Project manager Web interface, an interactive TUI and a scriptable CLI without making an external SaaS the source of truth.

Version 2.3.2 adds a live framing engine before delivery. The same resumable plan frames a Project into Feature candidates or a Feature into Lots, then hands one exact published revision to the 2.3 delivery DAG. Legacy 2.2 campaigns are inspection-only, while existing v4 Features keep their historical workflows. English remains canonical for contracts and machine data.

## Requirements

- Node.js 22.13 or newer
- npm
- A local repository to manage
- Codex CLI or Claude Code CLI installed for the Agent integration (`arka-norn setup` checks this)

Docker, Podman and execution profiles are only needed when you activate automatic orchestration, not for framing.

## Install

For end users:

```bash
npm install -g arka-norn
arka-norn setup
```

`setup` detects the available Agent host, shows the targets it will write to, installs or updates the generated skills idempotently, and runs `skills doctor`. It does not install providers, credentials, Docker, Podman or execution profiles, and it copies no secrets.

The former command `arka-norn install` remains a documented alias for `arka-norn setup` during 2.3.

## Live framing

Start from the current folder. A Feature, workflow, Agent identity and previous chat session are not entry requirements.

```bash
arka-norn framing enter .
arka-norn framing enter . --new-feature "The outcome to deliver"
arka-norn framing show --view plan
arka-norn framing show --view evidence
arka-norn framing show --view map
arka-norn framing resume
```

The connected Agent updates the plan through bounded local deltas while the public CLI and Web interface expose human projections. The plan, not the chat, is the recovery source. Work in progress remains under `$ARKA_NORN_HOME/framing`; only a twice-stabilized published revision is published under the Project's `.arka-norn/plans` directory.

There are exactly two human stabilizations. The first authorizes repository grounding. The second binds publication, decomposition and the calculated delivery route. An empty repository is never audited: it moves to explicitly greenfield design. Implemented code receives an intent-blind structural reading before targeted confrontation.

Project plans produce Feature candidates without creating them in bulk. Feature plans produce bounded Lots with scopes, dependencies and functional, UX, code and security proofs. A directly framed new Feature is materialized only after publication.

Open Project tracking in the browser:

```bash
arka-norn web start
arka-norn web status
arka-norn web restart
arka-norn web stop
```

`web` without an action is an alias for `web start`. The managed server runs in the background, survives the launching terminal and opens the secured browser session by default. Add `--port 4317`, `--no-open` or `--json` when needed. `web restart` preserves the current port and browser session; `web stop` followed by `web start` creates a new secure session. Use `web foreground` only when the server must remain attached to the current terminal.

The Web interface presents Project health, active framing, Feature paths, published documents, decisions, audits, registered Agents and live Norn orchestration state. A Project prioritizes its current framing card; Plan, Evidence, Map and History remain available after a provider or session change. Starting a new Feature asks only for its expected outcome.

Its interface uses the official Arka Labs mark, compact Project rail, product surfaces, Poppins and JetBrains Mono in both dark and light themes. Light sand is reserved for layout chrome while working content remains white; primary commands stay neutral and Arka red identifies the product. Published documents are grouped by Feature and Pipeline order, retain replaced revisions, and receive an editorial EN/FR reading view with a contract-derived header, navigable dependencies and human-readable provenance. Read-only technical JSON remains available through progressive disclosure.

Project entry and Feature framing are guided for non-developers. Generated identifiers, folder choices, workflows and advanced technical values stay out of the primary framing flow.

## Safe automatic orchestration

Automatic orchestration is a separate, opt-in level of authority. It builds a published task DAG. Every task gets its own branch, private Git worktree, execution profile, read/write scopes and mechanical proof. Dependency-ready tasks with disjoint write scopes can run in parallel; overlapping scopes are serialized before authorization. Direct automatic execution no longer exists.

The human selects one provider/model profile per role and confirms the plan, risk policy, commit authority, application policy, budget and parallelism. Agents have no native shell, Git, commit, network or sub-agent authority. All reads, proposed changes, Docker/Podman recipes, evidence and decisions pass through the bounded Norn broker. Norn validates the result and creates the commit.

Choose the preferred tracking surface in Norn Web settings:

- Web: functional explanations and a live read-only timeline, with no command blocks;
- TUI: manual workflow and Agent identity management, with an explicit handoff to the 2.3 CLI for automatic runs;
- CLI: exact commands and stable JSON for expert automation.

See [Automatic orchestration](docs/automatic-orchestration.md) for workspace, budget, recovery and application guarantees.

Profiles, containers and budgets are requested only when you actually enable this level.

## Language

English is canonical for code, commands, identifiers, JSON fields, schemas and public documentation. Display text can be English or French.

```bash
arka-norn locale show
arka-norn locale set en
arka-norn locale set fr
arka-norn locale set auto
arka-norn --locale fr workflow list
ARKA_NORN_LOCALE=en arka-norn doctor
```

Resolution order is `--locale`, `ARKA_NORN_LOCALE`, saved preference, system locale, then English. Preferences are stored atomically in `$ARKA_NORN_HOME/.arka-norn/preferences.json` and never enter portable Project or Feature markers.

Machine JSON always uses canonical English values. Only its `display` block varies by locale.

## Workflows

| Workflow | Use it for | Required path |
| --- | --- | --- |
| Essential 2.3 | New grounded Features with bounded Lots. | `development_report -> delivery_audit -> delivery_validation` |
| Complete 2.3 | Grounded higher-risk Features whose downstream consumers require technical artifacts. | Required technical contracts, delivery, audit and validation |
| Essential legacy | Existing well-understood v4 Features. | `feature_brief -> development_report -> delivery_audit -> delivery_validation` |
| Complete legacy | Existing v4 Features with the historical full document chain. | Concept, plan, evidence, invariants, tasks, specification, delivery and QA |
| FastDev | Small, bounded corrections and refactors. | `rework_brief -> development_report -> delivery_audit -> delivery_validation` |

`technical_contract_appendix` is optional in Essential. Delivery audits can require a corrective `development_report`; validation always targets the latest report.

```bash
arka-norn workflow list
arka-norn workflow show essential
arka-norn essential start "Filter Features by status" --project product
arka-norn essential next <feature-id> --session <session-id> --json
```

Deprecated aliases `standard` and `essentiel` remain accepted with warnings throughout 2.x. Existing legacy Features continue on their French v3 contract until explicitly migrated.

## Verified flow

```bash
cd /workspace/product
arka-norn framing enter . --new-feature "Filter Features by status"
arka-norn framing resume
arka-norn framing show --view plan

# After the connected Agent obtains the second stabilization and publishes:
arka-norn agent advise --project product --feature filter-features
arka-norn pipeline next filter-features --json
```

A v5 document uses English field names and declares the prose locale:

```json
{
  "schema_version": 5,
  "content_locale": "fr",
  "id": "brief-filter-features-01",
  "feature_id": "filter-features",
  "type": "feature_brief",
  "sequence": 1,
  "created_at": "2026-08-23T09:00:00.000Z",
  "depends_on_document_ids": [],
  "author_agent_id": "Codex_product_20260823"
}
```

## Migration

The reader accepts legacy French v2/v3 Feature documents and Project audit v4 documents without rewriting them.

```bash
arka-norn migrate --target /workspace/product/feature
arka-norn migrate --target /workspace/product/feature --apply
```

Migration validates the whole Feature first, creates backups, preserves identity and graph relations, translates fields and enums, records the source version and SHA-256, and commits the marker last. Unknown, mixed or ambiguous contracts stop the entire operation. Repeating a successful migration is a no-op.

Framing does not silently migrate existing Feature markers. Marker v4 remains on its historical pipeline; marker v5 requires `pipelineDefinitionVersion: 2.3` and an exact `framingPlanRef`. See [Migration to live framing](docs/migration-2.3.2.md).

## JSON API

Public CLI JSON uses `schemaVersion: 2`:

```json
{
  "schemaVersion": 2,
  "command": "pipeline.status",
  "ok": true,
  "data": {},
  "errors": [],
  "warnings": [],
  "diagnostics": {
    "errors": [],
    "warnings": []
  },
  "display": {
    "locale": "en",
    "errors": [],
    "warnings": []
  }
}
```

Scripts must depend on `data`, stable diagnostic codes and parameters, never on localized `display` prose.

## Documentation

- [User guide](docs/user-guide.md)
- [CLI reference](docs/cli.md)
- [TUI guide](docs/tui.md)
- [Project Web guide](docs/web.md)
- [Essential workflow](docs/essential.md)
- [FastDev workflow](docs/fastdev.md)
- [Agent guide](docs/agent-guide.md)
- [Agent orchestration](docs/agent-orchestration.md)
- [Developer guide](docs/developer-guide.md)
- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Live framing contract](docs/norn-framing-contract-proposal.md)
- [Framing Product and UX method](docs/norn-framing-method-research.md)
- [Migration to live framing](docs/migration-2.3.2.md)
- [Stability contract 2.3](docs/stability-2.3.md)

Canonical examples are under `examples/feature-complete`, `examples/feature-essential`, `examples/feature-fastdev` and `examples/project-audit-v5`.

## Contributing

To build from a source checkout:

```bash
git clone https://github.com/arka-squad/arka-norn.git
cd arka-norn
npm install
npm run build
node bin/arka-norn.mjs --version
node bin/arka-norn.mjs doctor
```

## Quality

```bash
npm run lint
npm run typecheck
npm test
npm run selftest
npm run release:verify
npm run metrics:adoption
```

Source files are limited to 700 lines. Canonical code and public documentation are checked for French text. Generated skills, examples and Web locale catalogs come from shared canonical sources. Production Web assets are built into `dist/web/` and shipped in the npm package.

`metrics:adoption` is a maintainer-only, read-only report. It combines public npm download counts with the authenticated GitHub clone-traffic window exposed by `gh`; use `npm run metrics:adoption -- --json` for automation. Norn itself includes no installation telemetry. npm downloads are not unique installations, and GitHub clone traffic covers only the rolling 14-day window.

`.input/` is an ignored internal workspace. It is not packaged, published or included in public CI.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
