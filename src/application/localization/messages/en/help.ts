export const CLI_HELP_EN = `arka-norn - local Project, Feature and multi-provider workflow workspace

Without a command, arka-norn opens the interactive TUI.
Use arka-norn guide for a verified walkthrough.

Management:
  project <list|add|import|scan|show|use|forget|reconcile|set-orchestration-mode>
  feature <list|create|import|scan|show|use|forget|reconcile|set-workflow>
  orchestration <configure|preview|start|status|cancel|approve|retry>
  agent <list|register|show|current|use|sessions|advise|prompt|handoff-prompt|deactivate|replace>
  pipeline <status|next|scaffold|validate>
  workflow <list|show>
  essential <start|status|next>       Default Feature workflow.
  fastdev <start|status|next>
  audit <inspect|prepare|start|status|submit|finalize|cancel|resume|list|show|compare|kb|evidence|export|tools>
  locale <show|set auto|en|fr>
  web <start|stop|restart|status|foreground>
                                      Manage the local Project Web server.

Documents and health:
  status [feature-root]
  scaffold <step-id> <output.json> --agent <id>
  scaffold current_state_audit <output.json> --project <id> --agent <id>
  validate <document.json>             Validates schema and scaffold sentinels.
  pipeline validate <feature> --document <file.json>
                                      Also validates identity, relations and business verdict.
  doctor [--json] [--repair [--apply]]
  migrate [--target <path>] [--dry-run|--apply]

Maintenance:
  install [--target <repo>] [--global] [--profile <profile>]
  skills <list|install|doctor>
  selftest
  guide
  config
  --version | -v
  help | --help | -h
`;

export const CLI_GUIDE_EN = `arka-norn guided start

1. Verify health
   arka-norn doctor

2. Resolve the Project
   arka-norn project scan <root>
   arka-norn project list

   Optional: start Project tracking
   arka-norn web start
   arka-norn web status

3. Register the main Product identity
   arka-norn agent register --project <project-id> --provider "Codex CLI" --role product --session main
   arka-norn agent current --project <project-id> --session main

4. Open or create the Feature
   arka-norn feature list --project <project-id>
   arka-norn workflow list
   arka-norn feature create "Name" --project <project-id> --path <directory>

5. Read the calculated role and next action
   arka-norn agent advise --project <project-id> --feature <feature-id>
   arka-norn pipeline next <feature-id>

6. Create and validate one signed document
   arka-norn pipeline scaffold <step-id> --feature <feature-id> --session <session-id>
   arka-norn pipeline validate <feature-id> --document <file.json>

7. Prepare a Product handoff before changing context
   arka-norn agent handoff-prompt --project <project-id> --feature <feature-id>

Never guess a Project, Feature, Agent, session or next step. list, show, current, sessions, advise and next are the sources of truth.
`;
