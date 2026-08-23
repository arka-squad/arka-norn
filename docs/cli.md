# CLI Reference

## Global locale

```bash
arka-norn [--locale en|fr] <command>
arka-norn locale show [--json]
arka-norn locale set auto|en|fr [--json]
```

## Project and Feature

```bash
arka-norn project list|add|import|scan|show|use|forget|reconcile
arka-norn feature list|create|import|scan|show|use|forget|reconcile|set-workflow
```

New Features use Essential unless `--workflow complete|fastdev` is provided.

## Workflow and Pipeline

```bash
arka-norn workflow list
arka-norn workflow show complete|essential|fastdev
arka-norn pipeline status <feature>
arka-norn pipeline next <feature>
arka-norn pipeline scaffold <step> --feature <feature> --session <session>
arka-norn pipeline validate <feature> --document <file>
```

Deprecated aliases `standard` and `essentiel` emit stable warnings in 2.x.

## Guided workflows

```bash
arka-norn essential start|status|next
arka-norn fastdev start|status|next
```

`next --json` returns phase, iteration, prerequisites, stable reason/instruction codes, expected artifact and suggested command. The supplied Agent session is propagated to scaffolding.

## Agents

```bash
arka-norn agent list|register|show|current|use|sessions
arka-norn agent advise|prompt|handoff-prompt
arka-norn agent deactivate|replace
```

## Migration and health

```bash
arka-norn migrate [--target <path>] [--dry-run|--apply]
arka-norn doctor [--json] [--repair [--apply]]
arka-norn selftest
```

## JSON contract

Every public JSON response uses `schemaVersion: 2`, stable `data`, diagnostics with codes and parameters, and a localized `display` block. Exit codes remain stable across locales: 0 success, 2 incomplete, 3 invalid contract, 5 conflict, 64 usage error and 70 internal failure.
