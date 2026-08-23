export const CLI_MESSAGES = {
  "cli.locale.current": "Display locale: {locale} (preference: {preference})",
  "cli.locale.saved": "Locale preference saved: {preference}. Active locale: {locale}.",
  "cli.locale.usage": "Usage: arka-norn locale <show|set auto|en|fr> [--json]",
  "cli.help.header": "arka-norn: local Project, Feature and multi-provider workflow workspace",
  "cli.help.noCommand": "Without a command, arka-norn opens the interactive TUI.",
  "cli.help.locale": "locale <show|set>                    Show or persist the EN/FR display locale.",
  "cli.error.ttyRequired": "arka-norn requires an interactive terminal (TTY). Use a CLI subcommand in scripts.",
  "cli.error.noArguments": "{command} does not accept arguments.",
  "cli.error.invalidSelftest": "The selftest module is invalid.",
} as const;
