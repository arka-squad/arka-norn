# Automatic Orchestration

Automatic mode is an assisted control plane, not autonomous chaining. Project policy, provider health, capabilities, permissions, Feature scope and current Pipeline action are revalidated immediately before dispatch.

`claude` dispatches the installed, already authenticated Claude Code CLI. `codex` dispatches the installed, already authenticated Codex CLI. They use the user's local subscription session and never require `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or an arka.norn API-key variable. Optional absolute overrides are `ARKA_NORN_CLAUDE_CLI_COMMAND` and `ARKA_NORN_CODEX_CLI_COMMAND`; otherwise the executables are resolved from `PATH`.

Automatic and manual delivery are mutually exclusive. In `automatic` mode, Product must use `orchestration configure -> preview -> start -> status` and must never run `agent prompt`, print a copy/paste prompt, prepare a parallel manual handoff or ask the human to open another Agent session. In `manual` mode, the bounded Agent prompt remains the handoff mechanism.

Workers receive only the Feature root, a bounded mission, a minimal environment, local CLI authentication paths and preauthorized workspace permissions. Secret values are not copied into the mission or durable state. Shell and network authority are not inherited. Claude Code receives an explicit tool allowlist; Codex runs under its native read-only or workspace-write sandbox. Opaque provider permission requests fail safely and require review.

Execution records persist targets, transitions and safe proof references, never prompts, raw provider output or credentials.
