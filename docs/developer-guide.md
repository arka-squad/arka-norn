# Developer Guide

## Architecture

The code follows ports and adapters:

- `src/domain`: immutable entities and deterministic policies
- `src/application`: use cases, localization, compatibility and Pipeline inspection
- `src/ports`: inbound and outbound contracts
- `src/adapters`: CLI, TUI, filesystem, validation and provider adapters
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

The Web application is intentionally under ignored `.input/`. Public code exports generated locale and contract catalogs to its bridge; the Web application is never part of the npm package or public CI.
