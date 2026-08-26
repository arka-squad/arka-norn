export const CLI_HELP_FR = `arka-norn - espace local Project, Feature et workflows multiprovider

Sans commande, arka-norn ouvre la TUI interactive.
Utilisez arka-norn guide pour un parcours vérifié.

Gestion :
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

1. Vérifier la santé
   arka-norn doctor

2. Résoudre le Project
   arka-norn project scan <racine>
   arka-norn project list

   Optionnel : démarrer le suivi Project
   arka-norn web start
   arka-norn web status

3. Enregistrer l'identité Product principale
   arka-norn agent register --project <project-id> --provider "Codex CLI" --role product --session main
   arka-norn agent current --project <project-id> --session main

4. Ouvrir ou créer la Feature
   arka-norn feature list --project <project-id>
   arka-norn workflow list
   arka-norn feature create "Nom" --project <project-id> --path <dossier>

5. Lire le rôle et l'action calculés
   arka-norn agent advise --project <project-id> --feature <feature-id>
   arka-norn pipeline next <feature-id>

6. Créer et valider un document signé
   arka-norn pipeline scaffold <step-id> --feature <feature-id> --session <session-id>
   arka-norn pipeline validate <feature-id> --document <fichier.json>

7. Préparer un handoff Product avant de changer de contexte
   arka-norn agent handoff-prompt --project <project-id> --feature <feature-id>

Ne devinez jamais Project, Feature, Agent, session ou prochaine étape. list, show, current, sessions, advise et next sont les sources de vérité.
`;
