# CLI Reference

## Global locale

```bash
arka-norn --version
arka-norn -v
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

## Project Web

```bash
arka-norn web [start] [--port <port>] [--no-open] [--json]
arka-norn web status [--json]
arka-norn web restart [--port <port>] [--no-open] [--json]
arka-norn web stop [--json]
arka-norn web foreground [--port <port>] [--no-open] [--json]
```

`web` and `web start` launch one managed background server. It survives the launching terminal and records private runtime state under `$ARKA_NORN_HOME/.arka-norn/web/server.json`. With no `--port`, Norn selects a free port. The default opens the secured session URL; `--no-open` returns it without launching a browser.

`status` verifies the authenticated `/api/v1/health` endpoint instead of trusting a PID alone. `restart` stops the verified process gracefully while preserving its port and session token so open browser tabs recover. A full `stop` then `start` rotates the token. `stop` is idempotent. `foreground` is the explicit terminal-attached mode. Logs are written to `$ARKA_NORN_HOME/.arka-norn/web/server.log`.

The Web API is versioned under `/api/v1` and uses the public JSON envelope with `schemaVersion: 2`. Orchestration endpoints are read-only.

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
