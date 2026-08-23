# TUI Guide

Run `arka-norn` in an interactive terminal. The TUI presents Projects, Features, Agent identity, Pipeline state, evidence and assisted orchestration without hiding the underlying CLI contracts.

Keyboard controls:

- arrows: move selection
- Enter: open or confirm
- `/`: filter
- `?`: contextual help
- Escape: back
- `q`: quit from the home view

The language selector writes the same preference as `arka-norn locale set` and redraws the current screen immediately. Layouts are tested at 80, 120 and 160 columns. Below the minimum width the TUI shows an explicit resize state.

The TUI invokes application ports directly; it does not parse localized CLI prose.
