# User Guide

## Mental model

arka-norn manages a local hierarchy:

```text
Project -> Feature -> Pipeline -> signed Document / Run
```

A Project owns the Agent registry. A Feature belongs to exactly one Project and selects one workflow. Documents are append-only evidence; indexes are rebuildable caches.

## First run

```bash
arka-norn --version
arka-norn doctor
arka-norn project scan /workspace
arka-norn project list
arka-norn
```

Create a Project when no marker exists:

```bash
arka-norn project add /workspace/product --id product --orchestration-mode manual
```

Register the main Product identity:

```bash
arka-norn agent register --project product --provider "Codex CLI" --role product --session main
arka-norn agent current --project product --session main
```

## Create a Feature

Essential is the default:

```bash
arka-norn feature create "Search by status" --project product
arka-norn essential status search-by-status
arka-norn essential next search-by-status --session main --json
```

Choose Complete for uncertain architecture or migration work:

```bash
arka-norn feature create "Migrate authorization model" --project product --workflow complete
```

Choose FastDev only for bounded rework:

```bash
arka-norn fastdev start "Fix keyboard focus" --project product
```

## Track the Project in a browser

```bash
arka-norn web start
arka-norn web status
arka-norn web restart --no-open
arka-norn web stop
```

The server runs in the background and survives the launching terminal. `arka-norn web` is the short form of `web start`; add `--port 4317` to select a port or use `web foreground` for a terminal-attached process. `status` returns the verified URL, PID, port, start time and log path. Restarting preserves the current port and browser session so open views recover. Use `web stop` followed by `web start` when the secure session token must be rotated.

The Web interface is designed for Project managers rather than Agent operators. It shows aggregate Project state, Feature Pipelines, all signed and legacy documents in a human layout, linked evidence, open decisions, corrections, risks, audits, registered Agent identities and observed Norn campaigns.

Create Projects and Features, record governance decisions, run verified audits and apply Doctor repairs after reviewing a dry run. Framework documents remain immutable. Orchestration mutations are intentionally absent from Web; use the Product Agent or TUI, and use CLI only for expert automation.

Use **New Project** or **New Feature** for a guided creation flow. Select folders with the native system picker rather than typing filesystem paths. Norn proposes the technical identifier and Feature location automatically; expand technical details only when those defaults must change. Each workflow option explains its intended scope before you confirm.

On first launch, enter a human name. Norn stores a stable local profile and snapshots it into governance events so decisions remain understandable when the Project moves to another computer.

In Settings, choose Web, TUI or CLI as the preferred tracking surface. Web is the default for existing profiles. This changes how Product explains the next action, not what Product may do.

## Automatic Product delivery

For an automatic Project, tell the Product what outcome you want. Product verifies the Project and Feature, prepares a bounded campaign and explains the recommended local assistant and workspace mode. You do not copy a prompt or open a separate Agent session.

Follow progress in the Project **Live** view. The page explains the current phase, evidence, affected files, risks and any genuine decision. An isolated campaign changes only a private mirror until you review and apply its diff. A direct campaign writes through the broker, but tests and builds still require Docker or Podman and never execute on the host.

When Product asks for a decision, choose on the functional issue rather than approving an opaque provider permission. A stale decision is refused and replaced by the current situation. Cancel retains an isolated mirror for seven days; abandon discards it.

## Work on one step

1. Read the exact action with `pipeline next` or the guided workflow command.
2. Use the suggested scaffold command with the specialized Agent session.
3. Replace every sentinel.
4. Keep machine keys English and set `content_locale` to the prose language.
5. Validate the document.
6. Read the next action, but do not silently execute another role.

```bash
arka-norn pipeline scaffold feature_brief --feature search-by-status --session main
arka-norn pipeline validate search-by-status --document feature_brief.json --json
```

## Display language

```bash
arka-norn locale set auto
arka-norn locale set en
arka-norn locale set fr
arka-norn --locale fr pipeline status search-by-status
```

JSON business data remains identical in both locales. Only `display` changes.

## Resume work

```bash
arka-norn project show product --json
arka-norn feature show search-by-status --json
arka-norn agent sessions --project product --json
arka-norn agent advise --project product --feature search-by-status --json
arka-norn agent handoff-prompt --project product --feature search-by-status
```

The handoff command above is manual-mode recovery only. In automatic mode, use the Product conversation, TUI campaign cockpit or Norn Web live view; no prompt is generated.

## Legacy Features

A legacy French Feature remains on contract v3 and never mixes with v5 steps. Preview and apply migration explicitly:

```bash
arka-norn migrate --target /workspace/product/search-by-status
arka-norn migrate --target /workspace/product/search-by-status --apply
```

See [Project Web guide](web.md), [CLI reference](cli.md), [TUI guide](tui.md), [Agent guide](agent-guide.md) and [Troubleshooting](troubleshooting.md).
