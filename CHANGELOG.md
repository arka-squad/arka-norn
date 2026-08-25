# Changelog

Notable changes to arka-norn are recorded here. The project follows semantic versioning.

## 2.2.7 - 2026-08-25

### Changed

- Project Doctor results now use a human health summary with readable checks, status counts and repair availability instead of raw JSON.
- Feature indexes now follow the same visual grammar as signed Document indexes, with consistent hierarchy, status and responsive metadata.
- Signed Document views use the available content width and render structured records as full-width rows with codes attached to their titles.

### Fixed

- Removed the raw JSON switch from signed Document views and render nested metadata recursively as human-readable fields.
- Prevented structured record cards from splitting long titles into cramped two-column grids.

### Accessibility

- Feature and Doctor views remain free of horizontal overflow from 390 through 1920 pixels, with secondary list metadata progressively hidden on narrow screens.

### Distribution

- Package and manifest versions are 2.2.7.

## 2.2.6 - 2026-08-25

### Added

- Added a four-step first-run Web onboarding that connects a local human identity, an existing Project, the first Feature and a verified summary.
- Added durable, identity-bound onboarding progress with non-sensitive drafts, idempotent resume, valid-route recovery and document reading-position restoration.
- Added a mobile Project navigation bar with Overview, Features, Documents and an accessible More sheet.

### Changed

- Workflow choices and next actions use human labels while technical identifiers remain under progressive disclosure.
- Existing configured users migrate silently to route persistence without falsely completing onboarding.

### Accessibility

- The mobile More sheet traps focus, closes with Escape, restores focus and keeps 44-pixel touch targets without horizontal overflow at 390 pixels.

### Distribution

- Package and manifest versions are 2.2.6.

## 2.2.5 - 2026-08-25

### Added

- Added durable Product orchestration campaigns with a shared projection for Product, Norn Web, TUI and CLI.
- Added isolated Project mirrors, mechanical change receipts, sandboxed build recipes and atomic final application.
- Added a versioned Framework Context and a bounded arka.norn tool broker for Claude Code CLI and Codex CLI.

### Changed

- Automatic orchestration now always uses the Project root as its logical workspace and never exposes a prompt to copy.
- Human decisions, retries and change application use distinct revision-checked actions.
- Norn Web presents orchestration progress and evidence without requiring developer commands; the TUI provides an automatic campaign cockpit.

### Security

- Provider workers no longer inherit the global environment, native write/shell/network tools or unrelated credentials.
- Tests and builds execute only through Docker or Podman recipes with network disabled and no host fallback.

### Distribution

- Package and manifest versions are 2.2.5.

## 2.2.4 - 2026-08-24

### Added

- Added an accessible GitHub repository and star action to the bottom of the Web navigation rail.

### Changed

- Stacked document field labels above their values for a more natural human reading order.

### Distribution

- Package and manifest versions are 2.2.4.

## 2.2.3 - 2026-08-24

### Fixed

- Automatic orchestration dispatches missions directly through the installed, authenticated Claude Code CLI or Codex CLI without requiring provider API keys.
- Automatic Product advice no longer offers manual prompts, copy/paste handoffs or parallel preparation alongside an orchestrated mission.
- Codex CLI receives its global sandbox and approval options before the `exec` subcommand.
- Generated Product skill instructions preserve the strict separation between automatic orchestration and manual handoff across builds.

### Distribution

- Package and manifest versions are 2.2.3.

## 2.2.2 - 2026-08-24

### Added

- `arka-norn --version` and `arka-norn -v` report the installed package version without starting the TUI.
- Rejected local Web requests are logged with a sanitized method, path and error for actionable diagnostics.
- `npm run metrics:adoption` reports npm downloads and authenticated GitHub clone traffic without adding product telemetry.

### Fixed

- `web restart` preserves the active session token so existing browser tabs recover instead of failing every Project request.
- Expired browser sessions now display a specific recovery message instead of being presented as a Project-state rejection.

### Documentation

- README and the CLI, user, Agent, developer, Web, architecture, release and troubleshooting guides describe the current lifecycle and version commands.

### Distribution

- Package and manifest versions are 2.2.2.

## 2.2.1 - 2026-08-24

### Changed

- Project navigation now uses the compact Arka Labs rail with derived Project counters, release identity, live freshness and integrated EN/FR and theme controls.
- Documents are grouped by Feature and Pipeline order with working search, category filters, explicit revisions and visible replaced productions.
- The shared human document renderer now uses bounded editorial prose, a contract-derived reading header, semantic collection grids and distinct audit finding states without numbered decorative sections.
- Document footers expose navigable dependencies and human-readable provenance; raw contracts remain isolated in a consistent read-only JSON window with an explicit copy action.

### Fixed

- Light mode keeps sand on layout chrome while document and Project working surfaces remain white; dark mode preserves the corresponding Deck surface hierarchy.
- Legacy and canonical document lists no longer hide superseded revisions or conflate a completed collection with a business verdict.

### Distribution

- Package, manifest and generated Web contract versions are 2.2.1.

## 2.2.0 - 2026-08-24

### Added

- Guided Project and Feature creation for non-developers, with workflow explanations, generated technical defaults and progressive disclosure.
- Native operating-system folder selection behind the reusable `NornBridge` boundary and authenticated loopback API.
- Localized empty-state guidance and legacy document labels in English and French.

### Changed

- Web layout, official mark, icon sizing, typography, surfaces, modals and page transitions now follow the real Arka Labs Deck source contracts.
- Light sand is reserved for application chrome while working content remains white; primary commands use neutral controls and Arka red remains a product signal.
- Responsive navigation now follows the compact 56-pixel Deck rail at intermediate widths.

### Fixed

- Modal focus trapping, focus restoration, scroll locking and accessible descriptions are consistent across creation, profile, governance and audit flows.
- Meaningful microcopy meets contrast requirements in both themes.
- The TUI header derives its displayed version from the installed package manifest instead of a stale hard-coded value.

### Distribution

- Package and manifest versions are 2.2.0.

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
