# Release Process

1. update version, changelog, manifest and public English documentation
2. regenerate contracts, skills, examples and Web catalogs
3. run lint, language and max-line gates
4. run typecheck, unit, integration and E2E suites
5. verify `web start`, authenticated `status`, `restart` and idempotent `stop` with an isolated home
6. run coverage, selftest, benchmark and dependency audit
7. inspect `npm pack --dry-run --ignore-scripts`
8. verify `.input/` is absent from the tarball

Version 2.1 ships the local Project Web assets under `dist/web/`. `.input/` remains private and excluded. Legacy French data remains supported for all 2.x releases.
