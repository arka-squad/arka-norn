# arka-norn

arka-norn est le cockpit local et agent-agnostique qui transforme une intention en livraison vérifiable :

```text
Project → Feature → Pipeline → Documents / Runs / Handoffs
```

Un Project est une racine de travail suivie. Une Feature appartient explicitement à un Project grâce à `projectId`. Son Pipeline ordonne les étapes depuis le concept jusqu’à une recette QA passante liée au dernier CR de développement valide.

## Installation

```bash
npm install
npm link
arka-norn selftest
```

Le build TypeScript est régénéré par `prepare` et `prepack`. `npm run check` exécute le lint, les contrôles fonctionnels, le typecheck, le build et les tests TypeScript.

## Commandes

```bash
arka-norn                                           # TUI, terminal interactif requis
arka-norn project list|add|import|scan|show|use|forget|reconcile
arka-norn feature list|create|import|scan|show|use|forget|reconcile
arka-norn pipeline status|next|scaffold|validate
arka-norn skills list|install|doctor
arka-norn doctor [--repair [--apply]]
arka-norn migrate [--target <path>] [--dry-run|--apply]
arka-norn selftest                                  # vérifie le produit
arka-norn help
```

Les alias `status`, `scaffold`, `validate`, `install` et `depot` restent compatibles. Les sorties `--json` et codes sont détaillés dans [`docs/cli.md`](docs/cli.md).

## Stockage

```text
~/.arka-norn/index/projects.json
~/.arka-norn/index/features.json

<project-root>/.arka-norn/project.json
<feature-root>/.arka-norn/feature.json
```

Les markers portables sont les sources de vérité. Les index locaux sont des caches reconstructibles. Les formats v2 utilisent `schemaVersion`; la Feature porte obligatoirement `projectId` et `pipelineId`. Les anciens markers v1 sont uniquement des entrées de migration, jamais de nouvelles sorties.

## Pipeline

Les étapes sont définies dans [`pipeline.json`](pipeline.json) et leurs structures dans [`schemas/`](schemas/). Une conformité JSON ne suffit pas à terminer le Pipeline : la recette QA courante doit être `pass` et référencer le dernier CR valide.

L’exemple [`examples/feature-notion-linear/`](examples/feature-notion-linear/) illustre volontairement une QA en échec ; `status` renvoie donc le code `2` et propose un retour vers `cr_dev`.

## Skills

Les définitions sources vivent uniquement dans [`skills-src/`](skills-src/). Le catalogue versionné contient exactement 14 skills, dont audit, développement et recette QA. L’installation supporte les profils `core` (4), `delivery` (12) et `all` (14, défaut), un dry-run, les backups et le diagnostic par checksum.

```bash
arka-norn skills install --target . --profile all --dry-run
arka-norn skills install --target . --profile all
arka-norn skills doctor --target . --json
```

## Documentation

- [Architecture](docs/architecture.md)
- [CLI](docs/cli.md)
- [Cockpit TUI](docs/tui.md)
- [Skills](docs/skills.md)
- [Sécurité](docs/security.md)
- [Dépannage](docs/troubleshooting.md)
- [Décisions ADR](docs/adr/)

## Développement

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run check
```

Le vocabulaire canonique est défini dans [`docs/domain/vocabulaire.md`](docs/domain/vocabulaire.md).
