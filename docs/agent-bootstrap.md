# Démarrer un agent avec arka-norn

La skill publique `arka-norn` est le point d'entrée humain du framework. Elle prépare un agent sur un nouveau Project sans lui laisser deviner la racine, l'identité, le périmètre ou la prochaine action.

## Installer le point d'entrée avant le premier Project

Depuis une installation fonctionnelle d'arka-norn :

```text
arka-norn skills install --target <racine-existante> --profile core --global
```

L'option `--global` installe les skills dans `~/.claude/skills/` et `~/.codex/skills/`. Le même lancement installe aussi les copies locales dans `<racine>/.claude/skills/` et `<racine>/.agents/skills/` afin que le Project reste autonome.

## Message à envoyer au provider

- Claude Code ou un provider compatible avec les commandes slash : `/arka-norn`
- Codex : `$arka-norn`
- Provider sans syntaxe dédiée : `Utilise la skill arka-norn pour initialiser ce nouveau Project.`

La variante explicite reste préférable : elle indique sans ambiguïté que l'agent doit suivre le framework avant toute conception ou implémentation.

## Ce que l'agent doit faire

L'agent :

1. confirme l'activation du mode arka-norn et lit l'aide du produit ;
2. vérifie une racine existante et la santé du profil `core` ;
3. découvre, importe ou crée le Project avec une décision explicite de l'utilisateur ;
4. sélectionne ou enregistre une identité lisible `Provider_role_YYYYMMDD`, son périmètre et son état actif ;
5. affiche la santé, les Features connues et la prochaine décision attendue ;
6. s'arrête avant le Concept ou le code tant qu'aucune Feature n'a été choisie.

La sortie attendue commence par `Mode arka-norn activé` et se termine par un bloc `Session arka-norn initialisée` récapitulant le Project, l'agent actif, son périmètre, la santé et la prochaine action.

## Garde-fous

La skill ne doit jamais créer silencieusement un Project, choisir une Feature à la place de l'utilisateur, élargir le périmètre de l'agent ou réparer une divergence avec `--force` sans décision explicite. Une skill absente peut être installée ; une skill divergente doit d'abord être expliquée.

Après l'initialisation, `arka-framework-maitrise` guide le travail courant et route vers les skills spécialisées Concept, audit, plan, développement et recette QA.
