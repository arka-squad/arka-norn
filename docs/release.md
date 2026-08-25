# Release and npm deployment

The canonical npm deployment is `.github/workflows/publish.yml`. It publishes
from an immutable `vX.Y.Z` tag through npm Trusted Publishing (OIDC). Do not
publish from a developer token: it needlessly reintroduces browser loops, OTP
prompts and machine-specific npm cache failures.

## One-time npm configuration

Configure the `arka-norn` package once under **Settings → Trusted Publisher →
GitHub Actions**:

- organization: `arka-squad`
- repository: `arka-norn`
- workflow filename: `publish.yml`
- environment: empty
- allowed action: `npm publish`

The workflow deliberately has `id-token: write`, uses a GitHub-hosted runner,
Node 22 and npm 12.0.2. No `NPM_TOKEN` or long-lived publishing secret is
required. See the official [npm Trusted Publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## Release sequence

1. Update `package.json`, `package-lock.json`, `manifest.json`, `CHANGELOG.md`
   and any public documentation affected by the release.
2. Regenerate contracts, skills, examples and Web catalogs with `npm run build`.
3. Run `npm run release:verify` and inspect the package contents.
4. Commit the bounded release scope and create the annotated `vX.Y.Z` tag.
5. Push the branch, `main` and the tag without force. A new tag starts
   `publish-npm` automatically.
6. Verify the workflow and registry rather than retrying a local publish:

   ```bash
   gh run list --workflow publish.yml --limit 5
   npm view arka-norn version
   ```

For an existing tag that was pushed before the workflow existed, dispatch it
from `main`:

```bash
gh workflow run publish.yml --ref main -f tag=vX.Y.Z
```

The workflow checks out that exact tag, refuses a tag/package version mismatch,
runs every release gate, publishes via short-lived OIDC credentials and verifies
the resulting registry version.

## Authentication recovery

- `EOTP` from a local `npm publish` means the local-token path was used. Stop
  retrying it and run the trusted workflow.
- `/settings/<user>/tfa` is the account-settings challenge, not a pending npm
  publication approval page. It must not be used to approve a release.
- `ENEEDAUTH` in `publish-npm` means the npm Trusted Publisher is absent or one
  of `arka-squad`, `arka-norn` or `publish.yml` does not match exactly.
- `npm login --auth-type=web` remains useful for authenticated maintenance
  commands, but it is not part of package deployment.

The npm CLI still accepts a one-time password for direct publication, but this
repository intentionally uses OIDC instead. See the official [`npm publish`
reference](https://docs.npmjs.com/cli/commands/npm-publish/).

## Release verification details

The release gates cover lint, language and max-line checks, typecheck, unit,
integration and E2E suites, CLI/Web lifecycle checks, coverage, selftest,
benchmark, dependency audit and `npm pack --dry-run --ignore-scripts`.

Verify `.input/` is absent from the tarball. All 2.x releases ship the local
Project Web assets under `dist/web/`; legacy French data remains supported
throughout the 2.x line.

## Adoption metrics

```bash
npm run metrics:adoption
npm run metrics:adoption -- --period last-year --json
```

The report reads public npm download counts and authenticated GitHub full-clone traffic through the existing `gh` session. GitHub requires repository Administration read access and exposes only a rolling 14-day clone window. npm counts downloads rather than unique installations or users. This command is read-only and Norn ships no client telemetry.
