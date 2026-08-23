# Troubleshooting

## Pipeline remains incomplete

Run `pipeline status --json` and inspect stable diagnostics. A failed or partial review does not finish. A review linked to an older development report is stale.

## Author is rejected

Check `agent sessions --project <id>`, active scope and the scaffold session. Do not replace `author_agent_id` manually.

## Legacy and v5 documents are mixed

The Feature is blocked by design. Restore the Feature from backups or migrate the complete legacy Feature atomically.

## Locale is unexpected

Check `--locale`, `ARKA_NORN_LOCALE`, `locale show`, then system `LC_ALL`/`LANG`.

## Skills diverge

Run `arka-norn skills doctor` and reinstall from the generated catalog.

## Index or marker problem

Run `arka-norn doctor`. Repair actions are previewed and backed up before application.
