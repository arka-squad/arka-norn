# Developer Guide

## Architecture

The code follows ports and adapters:

- `src/domain`: immutable entities and deterministic policies
- `src/application`: use cases, localization, compatibility, Pipeline inspection and Project tracking projections
- `src/ports`: inbound and outbound contracts
- `src/adapters`: CLI, TUI, Web HTTP, filesystem, validation and provider adapters
- `src/composition`: dependency wiring and runtime coordination

Canonical data contracts are JSON Schema 2020-12 documents under `schemas/`. Legacy French contracts are isolated under `schemas/legacy/fr/`.

## Build

```bash
npm ci
npm run build
npm run typecheck
npm test
```

The build generates English skill definitions and canonical examples from shared sources. Generated output must not be edited manually.

## Localization

English message catalogs define the typed key and interpolation contract. Catalogs are split by domain under:

```text
src/application/localization/messages/en/
src/application/localization/messages/fr/
```

Resolution order:

1. `--locale en|fr`
2. `ARKA_NORN_LOCALE`
3. persisted preference
4. system locale
5. `en`

Use `translate`, `formatDate`, `formatNumber` and `Intl` helpers for human output. Machine data must remain locale-independent.

## Contract versions

- Feature marker v4 selects document contract v5.
- Legacy Feature marker v3 selects French contract v3.
- New documents require English fields and `content_locale`.
- Compatibility aliases and French mappings live in one table: `src/domain/compatibility/legacy-fr-contract.json`.

Never add a legacy field check outside the compatibility boundary. A managed inspection passes `documentContractVersion` explicitly so contracts cannot mix.

## Workflows

Canonical IDs:

- `arka-norn-complete`
- `arka-norn-essential`
- `arka-norn-fastdev`

Canonical policy keys are `order`, `required`, `dependsOn`, `loopTo` and `businessPolicy`.

Essential and FastDev share the guided application service. Adapters only supply workflow-specific command names, delivery steps and completion text.

## Migration

Feature migration is transactional:

1. discover every candidate document
2. reject unknown, ambiguous or mixed formats
3. normalize and validate every v5 document in memory
4. create source backups
5. write documents atomically
6. write the v4 marker last
7. rollback written targets after a failure

Provenance includes source schema version, source type, deterministic migration time and SHA-256 of exact source bytes.

## Quality gates

```bash
npm run check:max-lines
npm run check:language
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run selftest
npm pack --dry-run --ignore-scripts
```

No source file may exceed 700 lines. Keep changes scoped, extract reusable logic instead of copying it, and add tests at the affected contract boundary.

## Internal Web application

The shipped React/Vite source lives under `web/` and builds to `dist/web/`. `.input/` remains an ignored private workspace for design references and is never a source dependency.

Application contracts in `src/application/web/contracts.ts` define `NornBridge` and the Project tracking read models. The browser uses the HTTP bridge; a future Tauri adapter can implement the same interface without changing view components. Orchestration views consume the durable domain projection and must not recalculate a next action. Do not add Tauri code in the Web phase.

Folder selection follows the same boundary. Views call `NornBridge.pickFolder`; the loopback adapter delegates to the operating system picker and validates the selected real directory before returning it. Keep platform process handling in `native-folder-picker.ts`, never in React components. A phase-two Tauri adapter will replace this port implementation without changing the guided forms.

The server adapter binds to loopback, authenticates API and SSE requests, serves only packaged assets and emits invalidations rather than duplicated business events. View components reload complete read models after an invalidation. Orchestration APIs remain read-only.

The CLI lifecycle is split between `web-cli.ts`, the reusable `WebProcessManager` and `FsWebServerStateStore`. `web start` spawns the package entrypoint as a detached process; state and logs stay under `$ARKA_NORN_HOME/.arka-norn/web/`. Status and stop validate the authenticated health endpoint before trusting or signalling the recorded PID. Restart passes the existing token to the replacement process through its private environment so open tabs survive; stop then start rotates the token. State writes are atomic, private and serialized with the shared file-lock helper. Keep lifecycle behavior in these shared modules rather than adding shell-specific launch scripts.

`PRODUCT_VERSION` reads the package manifest and is the shared source for TUI, Web contracts and `arka-norn --version`/`-v`. Do not introduce a display-version constant in an adapter.

Maintainer adoption reporting lives in `scripts/adoption-metrics.mjs`. It derives package and repository identity from `package.json`, reads npm download counts and uses the authenticated `gh` CLI for GitHub's 14-day clone window. Keep it outside the product runtime: installations must not emit telemetry.

Web catalogs are generated from the typed localization source, while Pipeline metadata is generated from the canonical catalog. Add new human text to both typed catalogs and regenerate; do not copy translation or contract objects into the frontend.

The frontend consumes the official Arka Labs tokens and local brand assets from `web/src/styles/brand.css` and `web/public/assets/`. Use the Arka mark without substitute monograms, preserve Poppins/JetBrains Mono roles, keep sand on light layout chrome rather than working surfaces, and use neutral primary controls. New views must compose the shared button, status, navigation, modal, form and document patterns instead of introducing a parallel dashboard theme.

## Local Agent execution

Automatic `claude` and `codex` targets are local CLI adapters, not API-key adapters. Provider health resolves the installed executable, captures its sanitized `--version` output and hashes its real path/stat/version identity. Preview fingerprints and campaigns persist that identity; resume fails after a CLI replacement.

The detached worker receives a private `HOME`, controlled `PATH`, locale/temp values and only the provider-specific authentication directory (`CLAUDE_CONFIG_DIR` or `CODEX_HOME`) when it exists. Never forward `process.env`, a real general-purpose home or an API key for local CLI providers. Claude Code runs in safe mode with only the arka.norn MCP tools. Codex uses `exec --ephemeral`, read-only sandboxing, ignored user rules and disabled shell/multi-agent/browser/app tools.

`OrchestrationWorkspace` owns the Git-independent baseline, isolated mirror and atomic apply/rollback. Keep Project private state, secrets, symlinks, build output and nested repository metadata outside mirrors. Applying a diff must verify the entire real baseline so an unrelated human edit causes a global conflict.

The provider never edits the workspace directly. `scripts/orchestration-tool-server.mjs` is the only mutation and evidence broker. Add tools only with structured schemas, scope/revision validation, bounded output, redaction and a mechanical receipt. Repository recipes belong in `scripts/orchestration-recipe-runner.mjs` and must use pinned Docker/Podman images, no network and no host fallback.

`OrchestrationCampaign` is the durable human control envelope; `OrchestrationProjection` is the single presentation contract for Product, Web, TUI and CLI. Do not infer actions in an adapter. All mutations require the expected revision; confirmation actions also require their object fingerprint. Keep provider permission, Product decision, retry and diff application as distinct actions.

Keep manual prompt generation outside the automatic execution path. A JSON advice response with `orchestrationMode: automatic` must contain only `delivery: orchestrated` recommendations and must not contain `agent prompt` or a `prepare` recommendation.

Document pages use one structural renderer. Extend contract labels or structural presentations in the shared renderer; never create a copied renderer for a specific document type.

```bash
npm run build:web
npm run dev:web
npm run test:web:e2e
node --import ./tests/register-typescript-loader.mjs --test tests/e2e/web-cli.test.ts
```
