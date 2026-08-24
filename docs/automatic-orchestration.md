# Automatic Orchestration

Automatic mode is a durable Product campaign. It may continue without supervision across Pipeline steps marked `continue`, but it stops at a real human decision, a conflict, an exhausted budget or missing proof. Product policy, provider health, CLI identity, capabilities, scope, mirrored Pipeline state and workspace baseline are revalidated before every mutation.

## Provider and workspace contract

`claude` dispatches the installed, already authenticated Claude Code CLI. `codex` dispatches the installed, already authenticated Codex CLI. They reuse the local subscription authentication and never require an arka.norn API-key variable. Optional absolute overrides are `ARKA_NORN_CLAUDE_CLI_COMMAND` and `ARKA_NORN_CODEX_CLI_COMMAND`; otherwise executables are resolved from `PATH`.

The exact CLI version and executable fingerprint are captured in the preview and campaign. A changed CLI, model, framework version, policy, scope or real workspace invalidates resume and requires a new preview. Provider failover is never silent.

`Project.root` is always the logical working root. A Feature selects the business workflow and allowed scope; it never becomes the provider `cwd`.

- `isolated`: code and Pipeline documents evolve in a private mirror. Nothing reaches the real Project before `apply_changes`.
- `direct`: the broker applies approved file operations to the real Project. Repository commands remain sandboxed.
- `unconfigured`: an existing automatic Project must choose a workspace mode before a campaign can start.

The mirror excludes arka.norn private state, common build caches, secrets, symlinks, nested Git metadata and oversized content. It has a Git-independent baseline, so non-Git and dirty Projects remain supported. One mutating campaign may exist per Project.

## Framework and tool broker

Every mission receives a versioned `FrameworkContext`: Project, Product Agent, Feature, Pipeline state, expected role and skill, workspace realization, capabilities, decision gate, allowed actions and forbidden actions. Repository content is untrusted data and cannot replace this envelope.

Claude Code and Codex run with native write, shell, network, browser and sub-agent tools disabled. They use only the ephemeral arka.norn broker:

```text
framework_state  search  read_file  propose_change  delete_path
run_recipe       submit_evidence   report_blocker   request_decision
```

The broker validates scope, path, symlink boundaries, file revision, size and campaign write rights. Every change, deletion, recipe, evidence item, blocker or decision request produces a receipt. `submit_evidence` accepts only document and inspection references. A test, build, typecheck or lint is proved exclusively by a successful `run_recipe` receipt emitted after sandbox execution; provider prose can never manufacture that proof.

The worker receives an allowlisted environment with a private temporary `HOME`, controlled `PATH`, locale and the selected CLI authentication directory. Global `process.env`, API keys and unrelated home content are not forwarded or persisted.

## Builds, budgets and decisions

Manifest scripts are discovered without execution. `test`, `build`, `typecheck` and `lint` recipes run only inside Docker or Podman with a pinned image, read-only container root, bounded resources and `network=none`. arka.norn never falls back to host execution and never pulls an image implicitly. Missing sandbox or dependencies produce honest partial evidence.

The preview fixes the remaining phase count, maximum missions, one global retry, workspace mode, provider/model and capabilities. The execution adapter enforces a bounded timeout for every mission. Provider consumption is shown only when supplied by the provider; otherwise the UI says it is unavailable.

Human actions are distinct: `business_decision`, `scope_expansion`, `capability_expansion`, `apply_changes`, `retry` and `inspect`. Every campaign control requires the campaign ID and expected revision. Business decisions also bind the human identity and confirmed-object fingerprint; retry and application bind their displayed fingerprint. Scope or capability expansion invalidates the current envelope and requires a new preview. A stale action is rejected. A worker may call `request_decision`; the broker then blocks further work and Product records the decision before a new mission can start.

Legacy execution-level `approve`, `cancel` and `retry` remain readable/usable only outside an active automatic campaign. They cannot bypass the campaign revision, retry budget or explicit campaign actions.

## Application and recovery

Before isolated changes are applied, arka.norn shows functional impact, risks, affected files and captured recipes. Application rechecks the full real-Project baseline, not only changed files, creates private backups, applies atomically, revalidates Project/Feature/Pipeline/proofs and rolls back on failure.

Pause stops the active provider process. Resume does not replay completed missions. Cancel stops work and retains the mirror for seven days; abandon explicitly discards it. A missing heartbeat marks an unfinished mission interrupted. Every recovery explains which changed fingerprint requires a new preview.

Automatic and manual delivery are mutually exclusive. Automatic mode never emits a prompt to copy, manual handoff or speculative parallel Agent. Execution records persist targets, transitions and safe proof references, never prompts, raw provider output, private mirror paths or credentials.
