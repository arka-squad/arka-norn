# Norn 2.3 release and deployment runbook

This file is the stable release path for repository and npm publication. Do not rediscover authentication or bypass a failed gate.

## Preconditions

1. Work only from `codex/norn-2.3-orchestration`, created from `origin/main@1896e98943572311522e43a38390074444c50a80`.
2. Leave pre-existing dirty working trees and worktrees untouched.
3. Confirm `git status --short`, the expected branch and the expected base.
4. Confirm the legacy recovery manifest and quarantine any live 2.2 automatic state. Never resume a 2.2 campaign.
5. Run the hostile-repository preview, single-task fixture, three-provider synthetic DAG, recovery test and clean-copy Cortex Deck documentation campaign.

## Verification

```bash
npm ci
npm run release:verify
npm run test:web
npm run test:web:e2e
```

The release is blocked by any failure, missing pinned container image, dependency audit finding, recovery mismatch, dirty baseline divergence or unpublished generated asset.

## Git publication

```bash
git status --short
git diff --check
git add <explicit-files>
git commit -m "feat(orchestration): replace automatic engine for 2.3"
git push origin codex/norn-2.3-orchestration
```

Merge through the repository's normal protected-branch process. Create tag `v2.3.0` only from the verified merge commit. Never force-push or move an existing release tag.

## npm Trusted Publishing

`.github/workflows/publish.yml` is the only npm publication path. The npm package must trust repository `arka-squad/arka-norn` and workflow `.github/workflows/publish.yml`. The workflow uses GitHub OIDC and must not receive an npm token secret.

Push `v2.3.0`, or manually dispatch `publish-npm` with existing tag `v2.3.0`. GitHub authentication belongs in the user's normal Chrome session when device authorization is needed; do not retry inside an authentication loop.

The workflow verifies tag/package parity, installs with `npm ci`, runs `release:verify`, publishes with provenance-capable npm and verifies `npm view arka-norn@2.3.0 version`.

## Rollback

Do not overwrite an npm release. If verification after publication fails, disable Project activation, preserve campaign/worktree evidence, record the incident and publish a new patch only after the same gates pass. Legacy 2.2 campaigns remain quarantined and are never used as rollback execution state.
