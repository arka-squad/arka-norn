# arka-norn

arka-norn est le cockpit local et agent-agnostique qui transforme une intention en livraison vérifiable :

```text
Project → Agent + Feature → Pipeline → Documents / Runs / Handoffs
```

Un Project est une racine de travail suivie. Une Feature appartient explicitement à un Project grâce à `projectId`. Son Pipeline ordonne les étapes depuis le concept jusqu’à une recette QA passante liée au dernier CR de développement valide.

## Installation

```bash
npm install
npm link
arka-norn selftest
```

Le build TypeScript est régénéré par `prepare` et `prepack`. `npm run check` exécute le lint, les contrôles fonctionnels, le typecheck, le build et les tests TypeScript.

Le package est propriétaire et distribué en interne par tarball GitHub, pas sur
le registre npm public. La procédure, les checksums, le SBOM et le rollback sont
décrits dans [`docs/release.md`](docs/release.md).

## Commandes

```bash
arka-norn                                           # TUI, terminal interactif requis
arka-norn project list|add|import|scan|show|use|forget|reconcile
arka-norn feature list|create|import|scan|show|use|forget|reconcile
arka-norn agent list|register|show|current|use|sessions|advise|prompt|handoff-prompt|deactivate|replace
arka-norn pipeline status|next|scaffold|validate
arka-norn workflow list|show
arka-norn fastdev start|status|next
arka-norn skills list|install|doctor [--global]
arka-norn doctor [--repair [--apply]]
arka-norn migrate [--target <path>] [--dry-run|--apply]
arka-norn selftest                                  # vérifie le produit
arka-norn guide                                     # parcours accompagné
arka-norn help
```

Les alias `status`, `scaffold`, `validate`, `install` et `depot` restent compatibles. Les sorties `--json` et codes sont détaillés dans [`docs/cli.md`](docs/cli.md).

## Stockage

```text
~/.arka-norn/index/projects.json
~/.arka-norn/index/features.json
~/.arka-norn/context/agents.json

<project-root>/.arka-norn/project.json
<project-root>/.arka-norn/agents.json
<feature-root>/.arka-norn/feature.json
```

Les markers portables sont les sources de vérité. Les index locaux sont des caches reconstructibles. Les formats v3 utilisent `schemaVersion`, omettent tout chemin machine et dérivent leur racine de leur emplacement canonique ; la Feature porte obligatoirement `projectId` et `pipelineId`. Les anciens markers v1/v2 restent des entrées de migration, jamais de nouvelles sorties.

Le registre Agents porte des identifiants lisibles `Provider_role_YYYYMMDD`, le provider, le rôle, le périmètre, `active` et la lignée de remplacement. Chaque session provider conserve sa propre sélection locale ; `main` est réservée au Product principal. Voir [`docs/agent-registry.md`](docs/agent-registry.md) et [`docs/agent-orchestration.md`](docs/agent-orchestration.md).

## Pipelines

Le catalogue fermé [`pipelines/catalog.json`](pipelines/catalog.json) résout le `pipelineId` de chaque Feature. Le workflow standard reste dans [`pipeline.json`](pipeline.json). FastDev est réservé aux reworks bornés : `cadrage_rework → cr_dev → audit_rework → correction conditionnelle → validation_fastdev`. Un identifiant inconnu est refusé sans fallback ni chemin arbitraire.

```bash
arka-norn workflow list
arka-norn fastdev start "Rework navigation" --project product
arka-norn fastdev next <feature> --session <session-id> --json
```

Une conformité JSON ne suffit pas à terminer un Pipeline : la revue courante doit être `pass` et viser le dernier CR livré. L’exemple [`examples/feature-fastdev/`](examples/feature-fastdev/) illustre une boucle de correction complète. Voir le [guide FastDev](docs/fastdev.md).

L’exemple [`examples/feature-notion-linear/`](examples/feature-notion-linear/) illustre volontairement une QA en échec ; `status` renvoie donc le code `2` et propose un retour vers `cr_dev`.

## Skills

Les définitions sources vivent uniquement dans [`skills-src/`](skills-src/). Le catalogue versionné contient exactement 18 skills, dont `arka-norn`, `arka-product`, `arka-fastdev`, la maîtrise du framework, l'audit, le développement et la recette QA. L'installation supporte les profils `core` (8), `delivery` (16), `all` (18, défaut) et les profils de rôles `product` (11), `architecture` (10), `audit` (9), `dev` (9), `qa` (8).

Pour lancer un nouveau Project, l'utilisateur envoie `/arka-norn` dans Claude Code ou `$arka-norn` dans Codex. Ce premier Agent devient le Product principal stable dans la session `main`. `$arka-product` explique ensuite la prochaine étape, prépare les prompts des rôles spécialisés et génère la reprise avant saturation du contexte.

À l’étape Concept, l’agent peut proposer un brainstorming optionnel dans ChatGPT ou Claude.ai pour économiser son contexte d’exécution. Il remet alors un prompt entièrement prérempli et un mode d’emploi ; la réponse externe est contrôlée et réconciliée localement avant de devenir un document produit.

```bash
arka-norn skills install --target . --profile all --dry-run
arka-norn skills install --target . --profile all
arka-norn skills install --target . --profile core --global
arka-norn skills install --target . --profile all --force  # sauvegarde puis répare les divergences
arka-norn skills doctor --target . --json
arka-norn skills doctor --target . --global --json       # inclut ~/.claude et ~/.codex
```

## Documentation

- [Architecture](docs/architecture.md)
- [CLI](docs/cli.md)
- [Cockpit TUI](docs/tui.md)
- [Registre Agents](docs/agent-registry.md)
- [Orchestration Product et sessions Agent](docs/agent-orchestration.md)
- [Démarrer un agent avec `/arka-norn`](docs/agent-bootstrap.md)
- [Brainstorming Concept avec ChatGPT ou Claude.ai](docs/concept-brainstorming-web.md)
- [Reworks FastDev](docs/fastdev.md)
- [Skills](docs/skills.md)
- [Sécurité](docs/security.md)
- [Dépannage](docs/troubleshooting.md)
- [Release et rollback](docs/release.md)
- [Décisions ADR](docs/adr/)

## Développement

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:coverage
npm run benchmark
npm run check
```

Le vocabulaire canonique est défini dans [`docs/domain/vocabulaire.md`](docs/domain/vocabulaire.md).
