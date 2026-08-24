# Architecture

## Project Web boundary

The Project Web application is a renderer over application-layer read models. It does not read repository files directly and it does not own a second Project, governance or execution database.

```text
React views -> NornBridge -> loopback HTTP API -> application projections
                                             -> canonical filesystem stores
filesystem watcher -> authenticated SSE invalidation -> read-model reload
CLI lifecycle -> verified health probe -> private PID/token state -> loopback server
```

`NornBridge` is transport-neutral. HTTP is the 2.1 adapter; Tauri is reserved for a separate phase. The execution ledger remains the only orchestration source of truth, and the Web API exposes no orchestration mutation.

The Web server is a single managed process per `ARKA_NORN_HOME`. Its transient state is not a Project database: it contains only the private local PID, port, bootstrap URL, start time and working directory needed by `web start|status|restart|stop`. PID signalling is gated by an authenticated health probe. A managed restart transfers the existing token only through the replacement process environment; a stop removes the state and the next start creates a new token.

arka-norn is local-first and follows a ports-and-adapters design. Portable markers and signed documents are durable truth; home indexes, skill installations and worker heartbeats are local operational state.

The Pipeline evaluator is deterministic and independent of locale. Adapters discover and validate documents, the domain selects business state, and presenters add localized display text.

The orchestration runtime is split into runtime state, mission planning, worker launching, provider configuration and proof validation. Each source file remains below 700 lines.

See the ADRs for ownership, CLI, migration and audit decisions.
