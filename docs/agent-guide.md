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

Use `$arka-norn` only for the main Product context. Specialized sessions use the calculated role skill. `author_agent_id` must match the active session binding.
