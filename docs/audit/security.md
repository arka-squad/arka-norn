# Audit Security

Audit tools run with bounded arguments, explicit allowlists and redacted outputs. Credentials are referenced by name and never serialized. Evidence paths must remain inside the audited root. Dynamic modules use the injected sandbox runner without a host fallback.

A pass requires reproducible evidence. Missing tools, denied access and inconclusive checks remain visible instead of being silently treated as success.
