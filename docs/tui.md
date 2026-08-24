# TUI Guide

Run `arka-norn` in an interactive terminal. The TUI presents Projects, Features, Agent identity, Pipeline state, evidence and orchestration through domain ports rather than parsing CLI prose.

Keyboard controls:

- arrows: move selection
- Enter: open or confirm
- `/`: filter
- `?`: contextual help
- Escape: back
- `q`: quit from the home view

The language selector writes the same preference as `arka-norn locale set` and redraws the current screen immediately. Layouts are tested at 80, 120 and 160 columns. Below the minimum width the TUI shows an explicit resize state.

## Automatic campaign cockpit

For an automatic Project, the Agent screen is a campaign cockpit. It shows the current phase, durable activity, completed and maximum missions, decision or conflict, remaining budget when known and the verified change summary. Available controls come only from `allowedActionIds`: pause, resume, cancel, inspect, consume the single confirmed campaign retry, record a business decision, review/apply changes or abandon.

The TUI never offers “generate prompt”, “copy prompt” or a manual handoff in automatic mode. Before application it lists creations, modifications, deletions, binaries and risk, then asks for the current fingerprinted action. Technical details are progressive disclosure rather than the primary message.

Manual orchestration keeps prompt and handoff actions under an explicit **manual orchestration** label. Changing the preferred surface between Web, TUI and CLI changes guidance only, never permissions.
