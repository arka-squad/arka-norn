export const CLI_HELP_FR = `arka-norn - espace local Project, Feature et workflows multiprovider

Sans commande, arka-norn ouvre la TUI interactive.
Utilisez arka-norn guide pour un parcours vérifié.

Gestion :
  framing <enter|show|resume|list>     Cadre ou reprend un Project ou une Feature avant livraison.
  project <list|add|import|scan|show|use|forget|reconcile|set-orchestration-mode>
  feature <list|create|import|scan|show|use|forget|reconcile|set-workflow>
  orchestration <profile|preview|start|status|apply|recovery>
  agent <list|register|show|current|use|sessions|advise|prompt|handoff-prompt|deactivate|replace>
  pipeline <status|next|scaffold|validate>
  workflow <list|show>
  essential <start|status|next>       Workflow Feature par défaut.
  fastdev <start|status|next>
  audit <inspect|prepare|start|status|submit|finalize|cancel|resume|list|show|compare|kb|evidence|export|tools>
  locale <show|set auto|en|fr>
  web <start|stop|restart|status|foreground>
                                      Gère le serveur Web Project local.

Documents et santé :
  status [feature-root]
  scaffold <step-id> <output.json> --agent <id>
  scaffold current_state_audit <output.json> --project <id> --agent <id>
  validate <document.json>             Valide le schéma et les sentinelles du scaffold.
  pipeline validate <feature> --document <fichier.json>
                                      Valide aussi l'identité, les relations et le verdict métier.
  doctor [--json] [--repair [--apply]]
  migrate [--target <path>] [--dry-run|--apply]

Maintenance :
  install [--target <repo>] [--global] [--profile <profil>]
  skills <list|install|doctor>
  selftest
  guide
  config
  --version | -v
  help | --help | -h
`;

export const CLI_GUIDE_FR = `Démarrage guidé arka-norn

1. Entrer dans le cadrage ou le reprendre depuis le dossier courant
   arka-norn framing enter .
   arka-norn framing resume

   Pour cadrer une nouvelle Feature sans la créer d'abord :
   arka-norn framing enter . --new-feature "Résultat attendu"

2. Continuer depuis l'action suivante calculée
   arka-norn framing show --view plan

   Norn conserve le plan vivant hors du dépôt. L'Agent ne questionne que
   lorsque continuer l'obligerait à inventer. Il existe exactement deux stabilisations.

3. Optionnel : suivre le Project dans le Web
   arka-norn web start
   arka-norn web status

4. Après publication, lire l'action de livraison calculée
   arka-norn agent advise --project <project-id> --feature <feature-id>
   arka-norn pipeline next <feature-id>
`;
