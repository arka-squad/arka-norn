# Changelog

## 2.3.5 - 2026-08-27

### Added

- The successful setup screen now shows the Arka Labs banner and the exact next steps to start the Web cockpit and frame a first Project.
- Added an 'arka-norn version' command that checks the published npm version and offers to update, skip until the next reboot, or skip the version entirely.
- Setup and 'web start' show a discreet, cache-only update reminder that never adds network latency and refreshes in the background.

### Distribution

- Package and manifest versions are 2.3.5.

 ## 2.3.4 - 2026-08-27
## 2.3.4 - 2026-08-27

### Fixed

- Host-coupled skills and install tests now provision a stub Agent host on PATH, so the release gates pass on runners without a real codex or claude binary.
- The interrupted-publication recovery test bases its timestamp on the real clock, removing a parallel-run flake where recovery observed an updatedAt earlier than createdAt.

### Distribution

- Package and manifest versions are 2.3.4.

 ## 2.3.3 - 2026-08-27
## 2.3.3 - 2026-08-27

### Added

- Norn Web can now inspect, preview and apply Doctor repairs with a fingerprinted, expiring dry run that refuses a diverged plan.
- Norn Web exposes the orchestration preview as human rows: task DAG, per-role profiles, cost signals, preflight causes and risk policy, without starting a run.
- Norn Web adds an authorization sheet that binds the exact preview fingerprint, per-role profile selection, commit, apply mode, budget mode and parallelism.
- Norn Web can apply a verified campaign candidate from the DAG tracker under the 2.3 invariants, mirroring the expert CLI path.
- Added the 2.3 stability contract documenting Project, Plan, Feature, Lot and Run and the read-only legacy status.

### Changed

- `orchestration.preview`, `orchestration.authorize` and `orchestration.apply` are now available on the Web surface in addition to the CLI.

### Security

- Every Web orchestration input is revalidated server-side; a diverged or missing preview fingerprint blocks authorization, and application refuses a dirty or diverged baseline.

### Distribution

- Added a package link guard that forbids dead relative Markdown links and pins excluded-file references to the release tag.
- Added a release adoption and parity gate to `release:verify` that packs the exact tarball and verifies README, skills, Web, CLI and migrations from it.
- Package and manifest versions are 2.3.3.

 ## 2.3.2 - 2026-08-26
## 2.3.2 - 2026-08-26

### Added

- Added a live framing engine that starts from any folder and frames either a Project or a not-yet-materialized Feature.
- Added deterministic `empty`, `skeleton`, `implemented` and `indeterminate` repository probes with content snapshots, exact inventories and explicit unsafe-state signals.
- Added immutable framing events and revisions under `$ARKA_NORN_HOME`, atomic pointer reconstruction, revision-checked local deltas and expurgated resume packets.
- Added Project-to-Feature and Feature-to-Lot decompositions, signed plan publication and exact v5 Feature references.
- Added `framing enter|show|resume|list` plus private broker mutations for connected Agents.
- Added Norn Web Plan, Evidence, Map and History views and a result-only “frame a new Feature” entry.

### Changed

- Framing now precedes delivery pipelines and contains exactly two human stabilizations: technical confrontation and final publication.
- The primary Agent skill resumes from the live plan rather than a provider session and never audits an empty repository.
- New v5 Features use the 2.3 Essential or Complete delivery definitions after an exact grounded publication; v4 Features keep their historical workflows.
- Norn Web no longer requires the identity-to-workflow onboarding wizard before the user can enter the Product.

### Security

- Agent deltas cannot set authority, derived state, stabilizations or publication, and unknown contract fields are rejected.
- Source facts require the current repository snapshot and `file:line`; absence claims require an inventory attestation.
- Published plan divergence, scope escape, symlinks, submodules and silent worker profile fallback block downstream orchestration.

### Distribution

- Package and manifest versions are 2.3.2.

## 2.3.1 - 2026-08-26

### Fixed

- The first Product-owned framing step is now reachable in automatic Projects instead of being blocked behind the validated Feature Brief that it must produce.
- First-run onboarding opens the created Feature, states that framing remains to be done and presents one explicit next action.
- Norn Web can prepare a bounded Product continuation context for ChatGPT or Claude.ai without exposing raw JSON or silently sending content to an external service.
- An existing main Product identity is reused when its provider conversation was lost; a missing first Product can be initialized without weakening author validation for existing signed documents.
- Specialist prompts remain unavailable in automatic mode until the verified orchestration DAG can take over.

### Distribution

- Package and manifest versions are 2.3.1.

## 2.3.0 - 2026-08-25

### Changed

- Automatic orchestration is replaced by a signed task DAG. Every task receives a dedicated branch, Git worktree, execution profile, read/write scopes and mechanical evidence.
- Project orchestration configuration uses schema 4. Legacy automatic campaigns are inspection/import-only and can never be resumed or retried.
- Provider/model selection is explicit per role through execution profiles. OpenCodex is the first generic gateway adapter and runs from a minimal private home.
- Campaign state is an append-only event journal with an atomically reconstructible projection, accurate task counters and retained recovery artifacts.
- Parallelism defaults to three tasks and only applies to dependency-ready tasks with disjoint write scopes.
- Norn, not the agent, creates validated commits with campaign, task, role, profile, execution and evidence trailers.
- Integration conflicts receive a dedicated integrator task. A deterministic priority fallback records discarded hunks, always requires a human gate and is never auto-applied.
- Automatic application is capped at risk score 20, rejects global denials and requires an unchanged clean baseline with fast-forward application.
- Norn Web presents the DAG, task scopes, profiles, proofs, risk and application gate as human-readable rows.

### Added

- `orchestration profile register|show|doctor`.
- `orchestration recovery inspect|quarantine|restore|import-legacy` with confirmation fingerprints.
- Budget modes `admission`, `hard-stop` and `observe`, plus explicit open-bar profile allowlists.
- Hardened private Git snapshots that preserve the user's branch, index and working tree.

### Security

- Git runs with structured arguments, disabled hooks, disabled global/system configuration and forbidden external filters/submodules.
- Agents have no native shell, Git, network, commit, publish or sub-agent authority; changes and containerized recipes pass through the Norn broker.
- Credentials remain external references and provider diagnostics retain only bounded, redacted stderr excerpts.
- Held GitNexus data is restored only when its SHA-256 matches the confirmed recovery manifest and the original target is free.

### Release

- Package and manifest versions are 2.3.0.

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
