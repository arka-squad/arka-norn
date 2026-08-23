# Security

arka-norn treats filesystem boundaries, Agent identity, provider permissions and proof as security contracts.

- atomic writes reject symbolic destinations
- reserved `.arka-norn` directories cannot receive Pipeline artifacts
- credentials are never stored in markers, policies or execution records
- provider output is ephemeral
- execution success requires a bounded marker and a new valid document
- migration validates all targets before mutation and keeps backups
- unknown contract formats fail closed

Report vulnerabilities through the repository security policy.
