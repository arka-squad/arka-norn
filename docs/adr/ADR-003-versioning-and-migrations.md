# ADR-003: Versioning and Migrations

Status: accepted.

Version 2 introduces Feature marker v4 and document contract v5. Legacy French contracts remain readable in 2.x. Migration is explicit, atomic, deterministic, idempotent and provenance-preserving. Unknown or mixed formats fail the whole Feature.
