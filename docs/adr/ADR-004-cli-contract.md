# ADR-004: CLI Contract

Status: accepted.

Public JSON uses `schemaVersion: 2`. Business data and diagnostic codes are locale-independent. Localized prose is isolated in `display`; scripts must not parse it.
