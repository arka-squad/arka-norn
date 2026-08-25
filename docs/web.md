# Project Web Guide

Norn Web is the primary visual tracking interface for Project managers. It presents verified framework state in a human layout. It remains read-only for orchestration mutations.

## Server lifecycle

```bash
arka-norn web start
arka-norn web status
arka-norn web restart
arka-norn web stop
```

`arka-norn web` is an alias for `web start`. It launches one managed background server that survives the terminal used to start it. Norn binds only to `127.0.0.1`; without `--port`, it selects an available port. The secured session opens in the browser unless `--no-open` is provided.

Use the complete command surface when operating or scripting the server:

| Command | Behavior |
| --- | --- |
| `arka-norn web start [--port <port>] [--no-open]` | Start the managed server or return the verified running instance. |
| `arka-norn web status` | Probe the authenticated health endpoint and report URL, PID, port, start time and log path. |
| `arka-norn web restart [--port <port>] [--no-open]` | Stop gracefully while retaining the current port and browser session. |
| `arka-norn web stop` | Stop the verified process. Repeating the command is safe. |
| `arka-norn web foreground [--port <port>] [--no-open]` | Keep the server attached to the current terminal. |

Every command accepts `--json`. Private state is stored with mode `0600` under `$ARKA_NORN_HOME/.arka-norn/web/server.json`; detached output goes to `server.log` in the same directory. Keep the returned session URL private while the server is running.

The first screen asks for a human name and optional email. This creates a stable local identity for governance events. It does not create an online account.

Creating a Project or Feature is a guided flow for non-developers. Choose locations with the operating system's native folder picker; paths are not entered in free-form fields. Norn suggests stable identifiers and a Feature location, then keeps those technical values under progressive disclosure. Workflow choices explain when to use Essential, Complete or FastDev before creation.

## First-run onboarding

New users follow four guided steps: create the local human identity, register an existing Project, create the first Feature and review a verified summary before entering the Project overview. Onboarding never asks for an AI provider, API key or online account.

Progress is bound to the local identity and stores only non-sensitive drafts. Reloading resumes the current step idempotently, invalid saved routes recover to the nearest valid Project view, and document reading position is restored when the user returns. Existing configured users migrate silently to route persistence without being forced through onboarding or being marked complete incorrectly.

Workflow cards use human labels and plain-language outcomes; technical workflow identifiers remain available under progressive disclosure. On small screens, the Project bar exposes Overview, Features and Documents directly. The More sheet contains the remaining destinations, traps keyboard focus, closes with Escape and restores focus to its trigger.

## Project tracking

The Project overview aggregates every registered Feature and reports:

- tracking coverage and freshness
- completed, blocked and invalid Feature state
- invalid documents and broken links
- open decisions and correction requests
- audits and active Norn orchestrations

Norn never invents cost, schedule, percentage completion or Agent connection state. The most degraded verified state determines aggregate health.

Feature views show the selected workflow, required-step completion, next step, signed documents and structural anomalies. Relationship views connect Project, Feature, Pipeline step, document, dependency, author, decision and audit nodes.

## Documents

Every canonical v5 and supported legacy document is available in a human view. The document index groups productions by Feature and Pipeline order. Search and category filters operate on the displayed data, and superseded documents remain visible with their revision and replaced state.

A single schema-driven renderer presents a signed-document cover, a contract-derived reading header, bounded editorial prose, checklists, structured collections, criteria, risks, tests and findings. Contract labels follow the active application locale while the document prose remains in its declared `content_locale`.

The document footer presents resolved dependencies as navigation and metadata or provenance as an expanded human table. Technical JSON is available only in the read-only technical view, with an explicit copy action. Markdown raw HTML is ignored. A missing dependency remains visible as an anomaly rather than disappearing.

Signed framework documents are immutable in the Web interface. Corrections create governance history and wait for a new signed production or an explicit resolution.

## Governance

The governance ledger is append-only under the Project's `.arka-norn/governance.json`. Events can open or resolve decisions, request corrections, acknowledge risks or debt and supersede prior decisions.

Each event records its targets, reason, timestamp and a snapshot of the human profile. Targets may refer to a Project, Feature, step, document, finding or debt and may include a JSON pointer.

## Agents and live activity

The Agents view reads the Project manifest and shows only declared identity, provider, role, scope and signed productions. It does not claim that an Agent is connected.

Live activity consumes the same durable `OrchestrationProjection` as Product, TUI and CLI. It shows campaign timeline, phase, provider and model, direct or isolated mode, measured consumption or an explicit “not supplied”, decision required, functional change summary, affected files and risk, captured test/build evidence, conflicts, interruption and heartbeat freshness.

Heartbeat means only that a Norn worker recently reported life. It is not a progress percentage. Prompts, terminal logs, stderr, environment values and secrets are never exposed.

Empty, loading, offline, stale, interrupted, blocked, partial, conflict and completed states remain distinguishable without color alone. The live view is keyboard reachable and exposes textual status for assistive technology.

Start, pause, cancel, decision, retry, application, model selection and provider configuration remain with the Product Agent, TUI or expert CLI. The Web API has no orchestration mutation endpoints.

## Audits and Doctor

Project audits use a verified sequence:

1. select scope, mode, depth and audit domains
2. inspect the immutable plan and confirmation fingerprint
3. start verified collection
4. finalize the recorded audit

Interrupted audits can be resumed and non-terminal audits can be cancelled. Doctor repairs always begin with a dry run and require a separate acknowledgement before apply.

## Language

Use the language button or Settings to switch between English and French immediately. Settings also selects the preferred tracking surface: Web, TUI or expert CLI. The preference changes Product guidance, never rights. Preferences are persisted by the bridge; Project IDs, routes, contracts, statuses and API data remain canonical.

Stable routes use real identifiers and English route segments independently of locale.

## Visual identity

Norn Web uses the official Arka Labs product system from the shared Deck sources: the canonical Arka mark, compact product wordmark, Lucide icon language, Poppins for interface text and JetBrains Mono for metadata. Arka red identifies the product, neutral black or white controls carry primary commands, and Arka green communicates active or verified state.

Dark mode separates the `bar`, `zone` and elevated working surfaces. Light mode reserves sand for the application chrome and layout rails while the working zone remains white. Dialog geometry, overlays, focus behavior, navigation motion and page transitions follow the same source patterns in both themes.

All fonts and brand assets are local. The application loads no visual resource from the network.

## Security model

The session token starts in the URL fragment, is removed from browser history and is sent as a Bearer credential to the local API and SSE stream. The server checks loopback origin and applies a CSP without external resources.

`web restart` preserves the current token so open browser tabs reconnect after the short interruption. `web stop` invalidates the session; the next `web start` creates a new token. If an old tab reports an expired session, run `arka-norn web` to reopen the current secured URL.
