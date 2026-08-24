# arka-norn

arka-norn is a local Project tracking and delivery framework for Features, signed documents, human decisions, evidence and auditable workflows. It provides a Project manager Web interface, an interactive TUI and a scriptable CLI without making an external SaaS the source of truth.

Version 2.1 adds the EN/FR Project Web interface. English remains canonical for contracts and machine data.

## Requirements

- Node.js 22.13 or newer
- npm
- A local repository to manage
- Claude, Codex, Kimi or Z.AI only when an external Agent runtime is needed

## Install

```bash
npm install
npm run build
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

`web` without an action is an alias for `web start`. The managed server runs in the background, survives the launching terminal and opens the secured browser session by default. Add `--port 4317`, `--no-open` or `--json` when needed. Use `web foreground` only when the server must remain attached to the current terminal.

From a source checkout, the equivalent shortcuts are `npm run web:start`, `npm run web:status`, `npm run web:restart` and `npm run web:stop`.

The Web interface presents Project health, Feature paths, every signed document in a human layout, decisions, audits, registered Agents and live Norn orchestration state. It never starts, stops, retries or configures an Agent; control stays in each provider's native application.

Its dark-first interface uses the official Arka Labs mark, product colors, Poppins and JetBrains Mono. Signed documents receive an editorial EN/FR reading view; technical JSON and provenance remain available through progressive disclosure.

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
```

Source files are limited to 700 lines. Canonical code and public documentation are checked for French text. Generated skills, examples and Web locale catalogs come from shared canonical sources. Production Web assets are built into `dist/web/` and shipped in the npm package.

`.input/` is an ignored internal workspace. It is not packaged, published or included in public CI.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
