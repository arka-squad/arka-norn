# Architecture

arka-norn is local-first and follows a ports-and-adapters design. Portable markers and signed documents are durable truth; home indexes, skill installations and worker heartbeats are local operational state.

The Pipeline evaluator is deterministic and independent of locale. Adapters discover and validate documents, the domain selects business state, and presenters add localized display text.

The orchestration runtime is split into runtime state, mission planning, worker launching, provider configuration and proof validation. Each source file remains below 700 lines.

See the ADRs for ownership, CLI, migration and audit decisions.
