# Security

arka-norn treats filesystem boundaries, Agent identity, provider permissions and proof as security contracts.

- atomic writes reject symbolic destinations
- reserved `.arka-norn` directories cannot receive Pipeline artifacts
- credentials are never stored in markers, policies or execution records
- provider output is ephemeral
- execution success requires a bounded marker and a new valid document
- migration validates all targets before mutation and keeps backups
- unknown contract formats fail closed

Automatic Product campaigns add a separate execution boundary:

- the logical workspace is always the verified Project root; isolated work uses a private mirror
- provider-native write, shell, network, browser and sub-agent tools are disabled
- file changes and deletions pass through a scoped, revision-aware broker
- repository tests and builds run only in pinned Docker/Podman recipes with no host fallback
- the worker receives a private `HOME`, controlled `PATH` and only the selected CLI authentication directory
- the CLI executable/version fingerprint, framework, policy, baseline and scope are rechecked on resume
- a provider statement is not evidence; receipts and valid signed documents are required
- final isolated application checks the complete Project baseline and rolls back from private backups on failure
- prompts, raw output, credentials, physical mirror paths and secret values never enter campaign or Web projections

An isolated mirror protects the real Project from unreviewed file changes. It is not described as a machine or network sandbox. Process authority is reduced independently by disabling native provider tools, brokering effects and containerizing repository execution. The local provider CLI still needs read access to its own authentication directory; arka.norn never copies that directory into Project state.

The local Web server listens only on `127.0.0.1`. Every API and SSE request requires a 256-bit session token and a matching Origin. The initial token is delivered in the URL fragment, removed from browser history, kept in session storage and sent as a Bearer credential. Responses use a restrictive CSP and no external assets.

Managed-server state, including the bootstrap URL, is stored with mode `0600` under `$ARKA_NORN_HOME/.arka-norn/web/`. Lifecycle operations serialize state access and probe the authenticated health endpoint before signalling a recorded PID, reducing stale-state and PID-reuse risk. A managed restart transfers the token to the replacement process through its private environment so open tabs remain valid. A full stop followed by start rotates the token. The state file is local runtime data and never enters a Project marker or npm package.

Web document rendering ignores raw HTML, filesystem access stays within verified Project and Feature boundaries, and API responses exclude prompts, provider output, terminal logs, environment values and secrets. Live tracking reports only durable Norn execution records, bounded proof references and heartbeat freshness.

Report vulnerabilities through the repository security policy.
