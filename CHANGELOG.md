# Changelog

Notable changes to arka-norn are recorded here. The project follows semantic versioning.

## 2.1.0 - 2026-08-24

### Added

- Local EN/FR Project Web interface launched with `arka-norn web`.
- Managed Web server lifecycle with background `start`, verified `status`, graceful `stop`, token-rotating `restart` and explicit `foreground` commands.
- Official Arka Labs identity with the canonical mark, local Poppins and JetBrains Mono assets, dark-first surfaces and shared semantic components.
- Editorial signed-document reader with localized contract labels, structured records, proofs, risks and progressive technical disclosure.
- Human Project, Feature, Pipeline and document projections, including canonical v5 and legacy documents.
- Append-only Project governance with stable human profiles, linked decisions, correction requests and acknowledgements.
- Read-only registered Agent and live Norn orchestration tracking.
- Verified Project audit lifecycle and Doctor dry-run confirmation in the Web interface.
- Typed `NornBridge`, authenticated loopback API v1 and debounced SSE invalidations.
- Responsive Playwright coverage and Web source line-limit enforcement.

### Security

- The Web server binds to `127.0.0.1`, uses a 256-bit session token, checks Origin and applies a restrictive CSP.
- Prompts, terminal output, environment values, provider secrets and orchestration controls are absent from Web responses.
- Markdown raw HTML and filesystem paths outside verified Project boundaries are rejected or left inert.

### Distribution

- React/Vite production assets are included under `dist/web/`.
- `.input/` remains ignored and excluded from npm packages and public CI.
- Package and manifest versions are 2.1.0.

## 2.0.0 - 2026-08-23

### Added

- English canonical v5 document contracts with required `content_locale`.
- English and French display localization with flag, environment, persisted preference and system detection.
- `locale show` and `locale set auto|en|fr`.
- Canonical Complete, Essential and FastDev workflow IDs and English step IDs.
- Public CLI JSON envelope v2 with stable diagnostics and localized `display`.
- Atomic, deterministic and idempotent migration of legacy French Features with backups and SHA-256 provenance.
- Generated English skill catalog v2 with bilingual triggers.
- Canonical English examples for all workflows and Project audit v5.
- Source line-limit and language gates.

### Changed

- Essential is the default workflow for new Features.
- Public documentation, code comments, schemas and distributed examples are English.
- The orchestration runtime is split into mission planning, worker launch, provider configuration and proof validation modules.
- The private Web application and design brief remain under ignored `.input/`.
- Package version is 2.0.0.

### Compatibility

- French v2/v3 Feature documents and Project audit v4 remain readable and migrable throughout 2.x.
- `standard`, `essentiel`, `arka-norn-default` and `arka-norn-essentiel` remain accepted as deprecated aliases.
- A non-migrated Feature stays entirely on its legacy definition and cannot silently mix v3 and v5 documents.

## 1.3.0 - 2026-08-22

- Added the Essential workflow as the default for new Features.
- Shared guided workflow, delivery audit and validation logic with FastDev.
- Added local reference resolution for scaffold `$defs`.
- Expanded the skill catalog to 21 entries.
- Added Essential documentation, examples and selftest coverage.

## 1.2.x

- Added controlled local orchestration, Project audit, provider policies and execution records.
- Hardened filesystem boundaries, audit trails and provider permission handling.
- Added Project marker v4 and portable Agent registries.

## 1.1.x

- Added Agent sessions, Product orchestration, FastDev and portable Feature markers.
- Added generated multi-provider skills and repair diagnostics.

## 1.0.0

- Initial local Project, Feature, Pipeline, schema, skill and TUI release.
