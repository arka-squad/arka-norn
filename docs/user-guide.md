# User Guide

## Mental model

arka-norn manages a local hierarchy:

```text
Project -> Feature -> Pipeline -> signed Document / Run
```

A Project owns the Agent registry. A Feature belongs to exactly one Project and selects one workflow. Documents are append-only evidence; indexes are rebuildable caches.

## First run

```bash
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

## Legacy Features

A legacy French Feature remains on contract v3 and never mixes with v5 steps. Preview and apply migration explicitly:

```bash
arka-norn migrate --target /workspace/product/search-by-status
arka-norn migrate --target /workspace/product/search-by-status --apply
```

See [CLI reference](cli.md), [TUI guide](tui.md), [Agent guide](agent-guide.md) and [Troubleshooting](troubleshooting.md).
