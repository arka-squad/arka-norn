# Project Web Guide

Norn Web is a local Project tracking interface for Project managers. It presents verified framework state in a human layout. It is not an Agent control surface.

## Start

```bash
arka-norn web
arka-norn web --port 4317
arka-norn web --no-open
```

Norn binds only to `127.0.0.1`. Without `--port`, it selects an available port. Keep the printed session URL private while the process is running.

The first screen asks for a human name and optional email. This creates a stable local identity for governance events. It does not create an online account.

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

Every canonical v5 and supported legacy document is available in a human view. A single schema-driven renderer presents a signed-document cover, contract facts, editorial sections, checklists, structured records, criteria, risks, tests, findings and dependencies. Contract labels follow the active application locale while the document prose remains in its declared `content_locale`.

Metadata and provenance are collapsed by default. Technical JSON is available as a separate view. Markdown raw HTML is ignored. A missing dependency remains visible as an anomaly rather than disappearing.

Signed framework documents are immutable in the Web interface. Corrections create governance history and wait for a new signed production or an explicit resolution.

## Governance

The governance ledger is append-only under the Project's `.arka-norn/governance.json`. Events can open or resolve decisions, request corrections, acknowledge risks or debt and supersede prior decisions.

Each event records its targets, reason, timestamp and a snapshot of the human profile. Targets may refer to a Project, Feature, step, document, finding or debt and may include a JSON pointer.

## Agents and live activity

The Agents view reads the Project manifest and shows only declared identity, provider, role, scope and signed productions. It does not claim that an Agent is connected.

Live activity observes executions registered by Norn. It may show durable status, Feature, step, provider session identifier when known, measured duration, last bounded event, heartbeat freshness, proof references and suspension reason.

Heartbeat means only that a Norn worker recently reported life. It is not a progress percentage. Prompts, terminal logs, stderr, environment values and secrets are never exposed.

Start, cancel, approval, retry, model selection and provider configuration remain in the native Agent or Norn CLI workflow. The Web API has no orchestration mutation endpoints.

## Audits and Doctor

Project audits use a verified sequence:

1. select scope, mode, depth and audit domains
2. inspect the immutable plan and confirmation fingerprint
3. start verified collection
4. finalize the recorded audit

Interrupted audits can be resumed and non-terminal audits can be cancelled. Doctor repairs always begin with a dry run and require a separate acknowledgement before apply.

## Language

Use the language button or Settings to switch between English and French immediately. The preference is persisted by the bridge. Display labels and human formatting change; Project IDs, routes, contracts, statuses and API data remain canonical.

Stable routes use real identifiers and English route segments independently of locale.

## Visual identity

Norn Web uses the official Arka Labs product system: the canonical Arka mark, Poppins for interface text, JetBrains Mono for metadata, dark `bar` and `zone` surfaces, Arka red for brand and primary actions, and Arka green for active or verified state. The official dark theme is the default; the sand theme is an opt-in display preference.

All fonts and brand assets are local. The application loads no visual resource from the network.

## Security model

The session token starts in the URL fragment, is removed from browser history and is sent as a Bearer credential to the local API and SSE stream. The server checks loopback origin and applies a CSP without external resources.

Stopping the `arka-norn web` process invalidates the session. Restart the command to receive a new URL and token.
