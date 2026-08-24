# Release Process

1. update version, changelog, manifest and public English documentation
2. regenerate contracts, skills, examples and Web catalogs
3. run lint, language and max-line gates
4. run typecheck, unit, integration and E2E suites
5. verify `--version`, `-v`, `web start`, authenticated `status`, session-preserving `restart`, token-rotating stop/start and idempotent `stop` with an isolated home
6. run coverage, selftest, benchmark and dependency audit
7. inspect `npm pack --dry-run --ignore-scripts`
8. verify `.input/` is absent from the tarball

## Adoption metrics

```bash
npm run metrics:adoption
npm run metrics:adoption -- --period last-year --json
```

The report reads public npm download counts and authenticated GitHub full-clone traffic through the existing `gh` session. GitHub requires repository Administration read access and exposes only a rolling 14-day clone window. npm counts downloads rather than unique installations or users. This command is read-only and Norn ships no client telemetry.

All 2.x releases ship the local Project Web assets under `dist/web/`. `.input/` remains private and excluded. Legacy French data remains supported throughout the 2.x line.
