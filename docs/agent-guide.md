# Agent Guide

An Agent must never infer Project, Feature, identity, session or Pipeline phase.

1. Run `arka-norn locale show --json`.
2. Resolve Project and Feature with `show`.
3. Resolve the current scoped Agent with `agent current` and `agent sessions`.
4. Read the exact action from `pipeline next`, `essential next` or `fastdev next`.
5. Execute one suggested scaffold command.
6. Use English contract keys and set `content_locale` to the prose language.
7. Validate the signed document.
8. Read and report the transition, then stop.

Skills are authored once in English. Their English and French triggers choose the same logic, and replies follow the active locale. Scripts and Agents must use stable JSON codes and parameters instead of `display` prose.

The Project Web interface may display an Agent's manifest identity, declared provider, role, scope and signed productions. It does not infer connection state and does not control the Agent. Live orchestration views expose only Norn's durable execution state, heartbeat freshness and verified proof references; they never expose prompts, terminal logs, environment values or secrets.

When an Agent needs the Project tracking surface, use `arka-norn web status --json` first. Start it with `arka-norn web start --no-open --json` only when stopped, and report the returned URL to the human. Do not launch a second foreground server or treat Web server lifecycle as Agent orchestration control.

Project and Feature location selection belongs to the human Web flow and uses a native folder picker. An Agent must not emulate that interaction by inventing or entering a path. For scripted creation, use the canonical CLI contract with an explicitly verified path supplied by the human or the current Project context.

Use `$arka-norn` only for the main Product context. Specialized sessions use the calculated role skill. `author_agent_id` must match the active session binding.
