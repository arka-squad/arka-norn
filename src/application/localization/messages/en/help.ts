export const CLI_HELP_EN = `arka-norn - local Project, Feature and multi-provider workflow workspace

Without a command, arka-norn opens the interactive TUI.
Use arka-norn guide for a verified walkthrough.

Management:
  framing <enter|show|resume|list>     Frame or resume a Project or Feature before delivery.
  project <list|add|import|scan|show|use|forget|reconcile|set-orchestration-mode>
  feature <list|create|import|scan|show|use|forget|reconcile|set-workflow>
  orchestration <profile|preview|start|status|apply|recovery>
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

1. Enter or resume framing from the current directory
   arka-norn framing enter .
   arka-norn framing resume

   To frame a new Feature without creating it first:
   arka-norn framing enter . --new-feature "Expected outcome"

2. Continue from the calculated next action
   arka-norn framing show --view plan

   Norn keeps the live plan outside the repository. The Agent asks only when
   continuing would invent substance. There are exactly two stabilizations.

3. Optional: follow the Project in Web
   arka-norn web start
   arka-norn web status

4. After publication, read the delivery action
   arka-norn agent advise --project <project-id> --feature <feature-id>
   arka-norn pipeline next <feature-id>
`;
