# Automatic orchestration 2.3

Norn 2.3 replaces the former automatic campaign engine. A campaign is now a confirmed Git snapshot plus a signed task DAG. Every task has a role, dependencies, read scopes, write scopes, deliverables, validations, execution profile, branch, worktree, attempt history and proof set. Legacy 2.2 automatic campaigns remain inspectable but can never be resumed or retried.

Manual Project workflows remain available. Automatic campaigns require an automatic Project, an activated schema-4 orchestration configuration and a Git repository.

## Execution profiles and gateways

An execution profile separates transport (`codex-cli`, `claude-cli`, `gemini-cli` or `api`), optional gateway, provider, model, credential reference, capabilities, egress hosts and cost metric. A credential reference names an allowlisted environment variable or Keychain item; the credential value is never stored in Project or campaign state.

OpenCodex is the first gateway adapter. Its endpoint and controlled model catalogue are fingerprinted. The endpoint must be present in the profile egress allowlist. Norn creates a minimal private `HOME`, copies only the verified catalogue and writes the generated CLI configuration there. It never copies the user's complete configuration.

```bash
arka-norn orchestration profile register \
  --project my-project \
  --id opencodex-zai \
  --transport codex-cli \
  --gateway-kind opencodex \
  --gateway-endpoint https://gateway.example.test/v1 \
  --catalog-ref /absolute/path/model-catalog.json \
  --provider zai \
  --model zai/glm-5.2 \
  --credential-kind environment \
  --credential-ref OPENCODEX_SOURCE \
  --credential-env OPENAI_API_KEY \
  --egress gateway.example.test \
  --cost-meter currency_eur \
  --cost-observable \
  --activate

arka-norn orchestration profile doctor opencodex-zai --project my-project
```

The doctor executes the same runtime, private home, path, credential mapping, gateway, provider, model and command used by a worker. A wrapper with `#!/usr/bin/env node` remains functional because the controlled path includes the Node runtime directory. Failures retain the exit code and at most 1,000 redacted stderr characters.

## Preview and authorization

Preview creates a private snapshot through a temporary Git index. It includes tracked files, authorized local modifications and only explicitly declared untracked files. The user's branch, index and working tree are not changed. Git hooks, global/system configuration, external filters, submodules and unsafe protocols are disabled.

Every impacted area in the Feature Brief must start with an explicit Project-relative path. Before preview, register exactly one active Feature-scoped Agent for each task role and one root-scoped Agent carrying the `integrator` responsibility. Missing or ambiguous ownership blocks planning with `scope_unresolvable`, `agent_scope_unavailable` or `agent_scope_ambiguous`; Norn never invents a wider scope or identity.

```bash
arka-norn orchestration preview \
  --project my-project \
  --feature my-feature \
  --include-untracked docs/new-guide.md
```

The human view shows the DAG, dependencies, scopes, profiles, cost metric, preflight causes, plan fingerprint and risk-policy fingerprint. Overlapping independent write scopes are converted into explicit dependencies; only disjoint ready tasks may run together.

Start requires one confirmed profile per role, including `integrator`, plus commit, application, budget and parallelism policy:

```bash
arka-norn orchestration start \
  --project my-project \
  --preview PLAN_SHA256 \
  --profiles development=opencodex-zai,integrator=claude-integrator \
  --actor human-profile-id \
  --confirm-policy POLICY_SHA256 \
  --allow-commits \
  --apply human \
  --max-parallel 3 \
  --budget-mode admission \
  --budget-limits opencodex-zai:currency_eur:20,claude-integrator:calls:10
```

`all` parallelism is accepted only as an explicit value. A profile without a bounded limit must appear in `--open-bar`; the confirmed risk policy and actor make that choice durable. Provider, model, scope and budget never change silently.

## Worker authority and proofs

Task agents receive no native shell, Git, commit, network, browser, publish or sub-agent tools. They use the Norn MCP broker to inspect bounded files, propose revision-checked changes, delete bounded regular files, run a declared recipe, submit evidence, report a blocker or request a decision.

Tests, builds, type checks and lint run only in pinned Docker/Podman recipes with `network=none`, a read-only container root, dropped capabilities and bounded resources. There is no host fallback and no implicit image download. A task succeeds only with a mechanical passing recipe receipt. Norn validates all changed paths and creates the commit with campaign, task, role, profile, execution and evidence trailers.

## Budget behavior

- `admission`: the current batch finishes; no new task is admitted after a limit is reached.
- `hard-stop`: the current worker is stopped gracefully, its worktree is retained and the attempt becomes `budget_stopped`.
- `observe`: usage is recorded and warned about without blocking.

CLI quota percentage, calls, duration and API euros use their native units when observable. Missing measurement is displayed as unknown rather than estimated.

## Integration, risk and application

Norn integrates task commits in DAG order on a dedicated branch. A conflict creates an integrator task in the integration worktree. If that attempt cannot resolve the conflict, Norn keeps the higher-priority change, records every discarded hunk fingerprint and produces a human-only candidate.

Global denials cover secrets, out-of-scope paths, symlinks, submodules, Git metadata, missing proof and undeclared operations. Ordinary risk weights are 1 per documentation file, 10 per test, 15 per source file, 25 per configuration or lockfile, 50 per CI/security/release file, plus deletion, binary, executable and bounded churn factors. Model analysis can add 0–20 and can never reduce risk. The maximum automatic threshold is 20.

Automatic application additionally requires explicit authorization, all validations, no priority fallback, a clean and unchanged real repository, and a fast-forward. A campaign built from a dirty working tree always stops for human application. Norn's apply command deliberately refuses to mutate a dirty or divergent real worktree; the retained candidate, manifest and worktrees are then reviewed and applied through the repository's normal human integration procedure.

## Recovery and legacy import

```bash
arka-norn orchestration recovery inspect --project my-project
arka-norn orchestration recovery quarantine --project my-project --confirm MANIFEST_SHA256
arka-norn orchestration recovery import-legacy QUARANTINE_ID --project my-project --confirm MANIFEST_SHA256
arka-norn orchestration recovery restore QUARANTINE_ID --project my-project --confirm MANIFEST_SHA256
```

Inspection inventories Project policy, campaigns, executions, identities, workers, workspaces and held artifacts without mutation. Quarantine requires the exact fresh manifest fingerprint and is made read-only. Legacy providers import only as disabled 2.3 profiles; credentials and exact preflight must be resolved again.

GitNexus `lbug` data is restored only when its file hash still matches the signed manifest and `.gitnexus/lbug` is absent. No worktree is deleted because of its location. Norn retains branches, worktrees, attempts and evidence after failure or interruption for explicit recovery.
