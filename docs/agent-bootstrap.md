# Démarrer un agent avec arka-norn

La skill publique `arka-norn` est le point d'entrée humain du framework. Elle prépare un agent sur un nouveau Project sans lui laisser deviner la racine, l'identité, le périmètre ou la prochaine action.

## Installer le point d'entrée avant le premier Project

Depuis une installation fonctionnelle d'arka-norn :

```text
arka-norn skills doctor --target <racine-existante> --profile all --global --json
arka-norn skills install --target <racine-existante> --profile all --global --dry-run
arka-norn skills install --target <racine-existante> --profile all --global
```

L'option `--global` installe les skills dans `~/.claude/skills/` et `~/.codex/skills/`. Le même lancement installe aussi les copies locales dans `<racine>/.claude/skills/` et `<racine>/.agents/skills/` afin que le Project reste autonome. Le profil `all` est volontaire : le point d’entrée et les 17 autres skills sont contrôlés ensemble, soit les 18 rendus Claude/Codex attendus.

Si le diagnostic trouve une divergence, il indique la skill et la copie locale ou globale concernée. L’installation standard s’arrête alors sans écrire. Après lecture du plan, seul un choix explicite de l’utilisateur autorise `--force`, qui sauvegarde la copie remplacée ; ne masquez jamais cette décision dans le démarrage.

## Message à envoyer au provider

- Claude Code ou un provider compatible avec les commandes slash : `/arka-norn`
- Codex : `$arka-norn`
- Provider sans syntaxe dédiée : `Utilise la skill arka-norn pour initialiser ce nouveau Project.`

La variante explicite reste préférable : elle indique sans ambiguïté que l'agent doit suivre le framework avant toute conception ou implémentation.

## Ce que l'agent doit faire

L'agent :

1. confirme l'activation du mode arka-norn et lit l'aide du produit ;
2. vérifie une racine existante et la distribution complète des 18 skills, localement et dans les points d’entrée globaux Claude/Codex ;
3. découvre, importe ou crée le Project avec une décision explicite de l'utilisateur, y compris son mode d’orchestration `manual` ou `automatic` ;
4. sélectionne ou enregistre l’unique identité Product principale `Provider_product_YYYYMMDD` dans la session `main` ;
5. lance `agent advise` pour expliquer la prochaine décision et les rôles mobilisables ;
6. route vers `arka-product`, qui prépare les prompts spécialisés et la reprise de contexte ;
7. s'arrête avant le travail spécialisé tant qu'aucune Feature et aucune phase n'ont été calculées.

La sortie attendue commence par `Mode arka-norn activé` et se termine par un bloc `Session arka-norn initialisée` récapitulant le Project, le Product principal en session `main`, la santé, le conseil et la commande de reprise.

## Garde-fous

La skill ne doit jamais créer silencieusement un Project, choisir une Feature à la place de l'utilisateur, élargir le périmètre de l'agent ou réparer une divergence avec `--force` sans décision explicite. Une skill absente peut être installée ; une skill divergente doit d'abord être expliquée.

Une nouvelle conversation ne crée pas un nouvel identifiant Product : `arka-norn agent handoff-prompt --project <id> [--feature <id>]` fournit le prompt de reprise qui sélectionne la même identité dans `main`. Le Pilote assisté reste borné : Arka Norn valide chaque mission, demande le choix explicite d’un assistant et de sa version, explique l’aperçu puis suspend toute permission ou preuve non prévue. La politique Project peut recommander un candidat éligible, sans remplacer cette confirmation. Voir [le Pilote assisté et l’orchestration contrôlée](automatic-orchestration.md).

Après l'initialisation, `arka-product` organise le Project. Les Agents spécialisés utilisent une session dédiée et `arka-framework-maitrise` ou `arka-fastdev` selon le workflow. Voir [`agent-orchestration.md`](agent-orchestration.md).
