# arka.norn

arka.norn is a local Project tracking and delivery framework for Features, signed documents, human decisions, evidence and auditable workflows. `arka-norn` is its command. It provides a Project manager Web interface, an interactive TUI and a scriptable CLI without making an external SaaS the source of truth.

The current release adds a four-step first-run Web onboarding, durable route and reading-position recovery, human workflow labels and mobile Project navigation. Existing configured users migrate without being forced through onboarding or being marked complete incorrectly. English remains canonical for contracts and machine data.

## Requirements

- Node.js 22.13 or newer
- npm
- A local repository to manage
- An authenticated Claude Code CLI or Codex CLI when automatic local Agent execution is needed; Kimi and Z.AI remain optional alternative integrations

## Install

```bash
npm install
npm run build
node bin/arka-norn.mjs --version
node bin/arka-norn.mjs doctor
```

Open the cockpit:

```bash
node bin/arka-norn.mjs
```

Open Project tracking in the browser:

```bash
node bin/arka-norn.mjs web start
node bin/arka-norn.mjs web status
node bin/arka-norn.mjs web restart
node bin/arka-norn.mjs web stop
```

`web` without an action is an alias for `web start`. The managed server runs in the background, survives the launching terminal and opens the secured browser session by default. Add `--port 4317`, `--no-open` or `--json` when needed. `web restart` preserves the current port and browser session; `web stop` followed by `web start` creates a new secure session. Use `web foreground` only when the server must remain attached to the current terminal.

From a source checkout, the equivalent shortcuts are `npm run web:start`, `npm run web:status`, `npm run web:restart` and `npm run web:stop`.

The Web interface presents Project health, Feature paths, every signed document in a human layout, decisions, audits, registered Agents and live Norn orchestration state. New users follow four guided steps: local identity, existing Project, first Feature and verified summary. It remains read-only for orchestration: the Product Agent is the conversational control, the TUI is the advanced cockpit and the CLI is the automation/diagnostic surface.

Its interface uses the official Arka Labs mark, compact Project rail, product surfaces, Poppins and JetBrains Mono in both dark and light themes. Light sand is reserved for layout chrome while working content remains white; primary commands stay neutral and Arka red identifies the product. Signed documents are grouped by Feature and Pipeline order, retain replaced revisions, and receive an editorial EN/FR reading view with a contract-derived header, navigable dependencies and human-readable provenance. Read-only technical JSON remains available through progressive disclosure.

Project and Feature creation are guided for non-developers. Folder locations use the operating system's native picker instead of editable path fields, while generated identifiers and advanced technical values stay out of the primary flow.

## Safe automatic orchestration

Automatic mode never asks the user to copy a generated prompt. The Product prepares one immutable campaign envelope, then arka.norn launches the selected local Claude Code CLI or Codex CLI itself. The logical working directory is always the Product Project root; a Feature supplies business context and write rights, never a replacement working directory.

An isolated campaign works in a private mirror and shows a verified change summary before the human applies anything. A direct campaign writes to the real Project but still runs repository tests and builds only through bounded Docker or Podman recipes. Provider-native write, shell, network and sub-agent tools stay disabled; all reads, proposed changes, recipes, evidence and decision requests pass through the arka.norn tool broker and produce mechanical receipts.

Choose the preferred tracking surface in Norn Web settings:

- Web: functional explanations and a live read-only timeline, with no command blocks;
- TUI: interactive campaign actions and technical detail on demand;
- CLI: exact commands and stable JSON for expert automation.

See [Automatic orchestration](docs/automatic-orchestration.md) for workspace, budget, recovery and application guarantees.

Install the generated Agent skills:

```bash
node bin/arka-norn.mjs install --global
node bin/arka-norn.mjs skills doctor
```

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
| Essential | New, well-understood Features. This is the default. | `feature_brief -> development_report -> delivery_audit -> delivery_validation` |
| Complete | Uncertain scope, new architecture, critical migrations or broad contracts. | Concept, plan, evidence, invariants, tasks, specification, delivery and QA |
| FastDev | Small, bounded corrections and refactors. | `rework_brief -> development_report -> delivery_audit -> delivery_validation` |

`technical_contract_appendix` is optional in Essential. Delivery audits can require a corrective `development_report`; validation always targets the latest report.

```bash
arka-norn workflow list
arka-norn workflow show essential
arka-norn essential start "Filter Features by status" --project product
arka-norn essential next <feature-id> --session <session-id> --json
```

Deprecated aliases `standard` and `essentiel` remain accepted with warnings throughout 2.x. Existing legacy Features continue on their French v3 contract until explicitly migrated.

## Verified Flow

```bash
arka-norn project add /workspace/product --id product --orchestration-mode manual
arka-norn agent register --project product --provider "Codex CLI" --role product --session main
arka-norn feature create "Filter Features" --project product
arka-norn agent advise --project product --feature filter-features
arka-norn pipeline next filter-features --json
arka-norn pipeline scaffold feature_brief --feature filter-features --session main
arka-norn pipeline validate filter-features --document feature_brief.json --json
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

Canonical examples are under `examples/feature-complete`, `examples/feature-essential`, `examples/feature-fastdev` and `examples/project-audit-v5`.

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
