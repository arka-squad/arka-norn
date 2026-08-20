# Audit complet de l’état réel — arka-norn v1.1.0

| Champ | Valeur |
|---|---|
| Date | 2026-08-20 |
| Dépôt | `arka-squad/arka-norn` |
| Référence auditée | `eca803e60156349e0967b7773c8b5225f202e95f` (`main`, synchronisé avec `origin/main`) |
| Runtime local | Node.js `v22.22.2` |
| Méthode | lecture directe, tests, couverture, benchmark, packaging, audit npm, GitNexus et comparaison documentation/code |
| État Git au départ | propre |
| Corrections pendant l’audit | aucune |

## 1. Verdict exécutif

**NO-GO pour considérer arka-norn comme une source de vérité fiable avant correction des constats F01 et F02.**

Le socle technique est globalement robuste : séparation hexagonale, validation JSON stricte, confinement des écritures, protections contre les symlinks, écritures atomiques, locks avec ownership, audit trail obligatoire, dépendance runtime unique, packaging autonome et performances très inférieures aux budgets.

En revanche, l’état Pipeline peut être recalculé sans registre d’auteurs sur plusieurs chemins publics. Un document v3 signé par un auteur absent ou hors scope peut alors ne plus invalider le rapport. Le diagnostic des skills peut aussi retourner `ok: true` et un code `0` avec `0/8` skill core saine. Ces deux écarts touchent directement les garanties de contrôle annoncées par le produit.

### Synthèse des constats

| ID | Priorité | Nature | Résumé |
|---|---:|---|---|
| F01 | P1 | Intégrité | Vérification des auteurs en fail-open dans la CLI par chemin et lors des recalculs TUI |
| F02 | P1 | Diagnostic | `doctor` considère `0/8 core` comme un avertissement compatible avec `ok: true` |
| F03 | P2 | Robustesse TUI | Les erreurs asynchrones du cockpit Feature peuvent devenir des rejets non gérés |
| F04 | P2 | Cohérence TUI | La santé affichée reste figée après installation/réparation des skills |
| F05 | P2 | Qualité | Toute la couche CLI TypeScript est mesurée à `0 %` par la couverture publiée |
| F06 | P2 | Contrat framework | L’audit d’un Project promis par la skill est impossible à représenter sans inventer une Feature |
| F07 | P2 | Exploitabilité | `arka-norn selftest` échoue dans un checkout de développement lancé hors npm |
| F08 | P3 | Documentation | L’aide de `validate` promet identité et relations, mais ne valide que schéma et sentinelles |

## 2. Périmètre et exclusions

### Audité directement

- architecture `domain/application/use-cases/ports/adapters/composition` ;
- CLI, TUI et cohérence de leurs chemins d’exécution ;
- moteur Pipeline, graphes documentaires et identité Agent ;
- Project, Feature, registres, sessions, index, locks et audit trail ;
- sécurité filesystem et résolution des catalogues ;
- schemas JSON, scaffolds et skills générées ;
- tests unitaires, intégration, E2E et couverture ;
- build, benchmark, paquet npm et dépendances ;
- documentation publique et ADR ;
- graphe GitNexus et cycles.

### Limites explicites

- une seule plateforme a été exécutée localement : macOS, Node 22 ; la matrice CI déclare macOS/Linux/Windows et Node 20/22/24, mais ses runs distants n’ont pas été consultés ;
- aucun credential ni API externe n’est requis ou audité ;
- le `doctor` lancé dans le sandbox a reçu `EPERM` sur le journal du home réel : ce point est une limite d’environnement, pas un défaut produit conclu ;
- aucune Feature arka-norn n’existe dans ce dépôt et le Project local n’est pas présent dans l’index utilisateur ; un `audit_etat_reel` v3 ne peut donc pas être signé honnêtement sans inventer un `feature_id`.

## 3. Constats détaillés

### F01 — P1 — La vérification des auteurs devient permissive

**Fait confirmé.**

Le moteur ne vérifie l’existence et le scope de l’auteur que si `authorRegistry` est fourni. À défaut, `validateFeatureAndAuthors` saute explicitement les contrôles des documents v3.

Deux chemins publics omettent ou abandonnent ce registre :

1. `resolveFeatureTarget` intercepte **toute** erreur de résolution d’un Project ou de son registre, puis poursuit avec `authorRegistry` absent. Le rapport reçoit seulement un warning. Cela couvre plus qu’un simple chemin non indexé : registre corrompu, Project absent et erreurs d’accès sont également absorbés.
2. La TUI charge correctement le registre à l’ouverture du cockpit, mais les actions « Statut » et « Continuer » rappellent ensuite `pipeline.inspect` sans registre. Le résultat peut donc différer de l’état initial sans aucun avertissement visible.

**Impact.** Un Pipeline peut être présenté comme complet ou actionnable alors qu’un auteur v3 est absent du registre ou hors scope. Le warning CLI ne restaure pas l’invariant et la TUI n’en émet aucun. Les écritures gérées par `pipeline scaffold` restent, elles, strictes ; le défaut porte sur la décision et le statut.

**Preuves.**

- `src/adapters/inbound/cli/pipeline-cli.ts:198-208` ;
- `src/composition/container.ts:131-152` ;
- `src/composition/tui/pipeline-scene-controller.ts:21-29` ;
- `src/domain/pipeline/evaluate-pipeline.ts:152-164` ;
- `docs/guide-developpeur.md:325` interdit explicitement les fallbacks permissifs après erreur de registre ;
- GitNexus relie `resolveFeatureTarget` à `runStatusCommand` et `runPipelineCommand`.

**Correction recommandée.** Centraliser la construction d’un contexte Pipeline géré et rendre le registre obligatoire pour toute Feature marquée. Distinguer explicitement « dossier historique non géré » d’une erreur de registre. Une erreur de registre doit produire le code `3`, jamais un rapport métier calculé sans identité. Ajouter des tests CLI et TUI avec auteur absent, hors scope et registre corrompu.

### F02 — P1 — `doctor` peut déclarer un socle core absent comme sain

**Fait confirmé, reproduit par la situation fournie par l’utilisateur (`0/8 core healthy`).**

`createDoctorRuntime` classe toute absence de skill core en `warn`. `runDoctor` définit ensuite `ok` par la seule absence de `fail`. Après l’alignement récent de la TUI sur `report.ok`, un environnement avec `0/8` core, aucune divergence et aucun autre FAIL obtient donc `ok: true` et le code `0`.

Ce comportement contredit :

- `docs/skills.md:16` : le Project est prêt si les 8 skills core sont saines ;
- ADR-004 : `0` signifie succès/complet et `3` état invalide ;
- le parcours Product, qui dépend de ces skills pour fonctionner.

Le test existant couvre `8/8 core + 10 optionnelles absentes`, mais aucun test ne fixe le verdict de `0/8 core`.

**Preuves.**

- `src/composition/doctor-runtime.ts:20-36` ;
- `src/application/doctor/run-doctor.ts:15-24` ;
- `tests/integration/security-doctor.test.ts:84-96` ;
- `docs/skills.md:14-16` ;
- `docs/adr/ADR-004-contrat-cli.md:18`.

**Correction recommandée.** Classer une skill core manquante en `fail`, conserver les seules skills de rôles absentes en `warn`, puis tester séparément `0/8`, `7/8`, `8/8 + optionnelles absentes` et divergence.

### F03 — P2 — Rejets asynchrones non gérés dans le cockpit Feature

**Fait confirmé par lecture du flot.**

Le menu lance `void handleSelect(value)`. La fonction `run` remet bien le verrou `busy` dans `finally`, mais ne capture pas l’erreur. Une erreur issue de `pipeline.inspect`, du catalogue, du registre ou de l’orchestration rejette donc une promesse qui n’est jamais observée. Avec le comportement standard de Node, cela peut terminer la TUI au lieu d’afficher un écran d’erreur.

La vue Project comparable capture les erreurs et les transforme en message, ce qui confirme l’incohérence de traitement.

Les menus Agent et orchestration lancent aussi plusieurs callbacks asynchrones avec `void` sans verrou global ; les mutations internes capturent leurs erreurs, mais des doubles validations peuvent encore se concurrencer et produire des scènes contradictoires.

**Preuves.**

- `src/adapters/inbound/tui/views/feature-detail-view.ts:56-57` et `120-128` ;
- `src/adapters/inbound/tui/views/project-detail-view.ts:171-187` capture l’erreur ;
- aucun test ne provoque un rejet de `onShowStatus`, `onContinue` ou `onOrchestrate`.

**Correction recommandée.** Ajouter un `catch` dans le runner commun de la vue Feature, convertir l’échec en ResultView ou message stable, et appliquer le même helper de sérialisation aux menus Agent/orchestration. Tester rejet et double Entrée.

### F04 — P2 — Santé TUI obsolète après installation des skills

**Fait confirmé.**

`createHomeView` calcule `skillHealth` et `systemHealth` une seule fois. Les closures `onShowHealth` conservent ces snapshots. L’installation peut réussir, mais revenir à l’accueil puis relancer Santé réaffiche les anciennes valeurs jusqu’au redémarrage complet de l’application.

Le texte de succès demande précisément de revenir à l’accueil et relancer Santé, ce qui rend le défaut directement visible.

**Preuves.**

- `src/composition/container.ts:225-247` ;
- `src/composition/tui/skill-scene-controller.ts:21-40` ;
- aucun test ne réinspecte la santé après installation.

**Correction recommandée.** Remplacer les snapshots par un callback asynchrone de réinspection, puis rafraîchir les résumés Home après toute installation/réparation.

### F05 — P2 — La couverture ne mesure pas la CLI critique

**Fait confirmé par `coverage/coverage-summary.json`.**

La suite E2E exécute le binaire compilé dans des sous-processus, alors que c8 publie la couverture des sources TypeScript du processus parent. Résultat : les onze fichiers `src/adapters/inbound/cli/**` sont tous à `0 %`, ainsi que `src/composition/bootstrap.ts`, malgré de nombreux tests CLI qui passent.

Le seuil global reste vert avec seulement `72,08 %` de lignes, ce qui masque l’absence de mesure sur les parseurs, mappings de codes et fallbacks publics où F01 se trouve justement.

**Preuves.**

- couverture totale : lignes/statements `72,08 %`, fonctions `76,37 %`, branches `74,82 %` ;
- `src/adapters/inbound/cli/pipeline-cli.ts`, `doctor-cli.ts`, `management-cli.ts`, `agent-cli.ts` et autres : `0 %` ;
- `package.json:47` applique uniquement des seuils globaux.

**Correction recommandée.** Collecter et fusionner la couverture des subprocessus/du code compilé avec sourcemaps, ou ajouter des tests directs des adapters CLI. Ajouter des seuils par répertoire pour la CLI et les contrôleurs TUI.

### F06 — P2 — Le format d’audit ne permet pas l’audit d’un Project seul

**Fait découvert pendant cet audit.**

La skill `arka-framework-audit` annonce l’audit d’un « projet ou d’une Feature ». Son format de sortie obligatoire est `audit_etat_reel`. Or `document-envelope.schema.json` exige toujours `feature_id`, et le schema d’audit n’offre aucune alternative `project_id`.

Le dépôt arka-norn possède un marker Project et un registre Agent, mais aucune Feature locale. Produire le JSON demandé obligerait donc à inventer une Feature, en contradiction directe avec les règles des skills.

**Preuves.**

- `.agents/skills/arka-framework-audit/SKILL.md` : Project ou Feature ;
- `schemas/document-envelope.schema.json:6-13` : `feature_id` obligatoire ;
- `schemas/audit-etat-reel.schema.json` ne définit aucun `project_id` ;
- aucun `.arka-norn/feature.json` n’existe dans le dépôt ;
- `arka-norn project list --json` retourne une liste vide malgré le marker local.

**Correction recommandée.** Soit borner la skill aux Features, soit introduire une enveloppe de document au scope explicite (`project_id` xor `feature_id`) avec migration versionnée. Ne pas contourner par une valeur factice.

### F07 — P2 — `selftest` dépend implicitement de npm dans un checkout

**Fait reproduit.**

La commande documentée `node bin/arka-norn.mjs selftest`, équivalente au binaire global lié sur ce checkout, termine à `54/55`. Le test de packaging lève immédiatement si `npm_execpath` est absent. `npm run selftest` passe parce que npm injecte cette variable ; un tarball installé passe également car les tests TypeScript ne sont pas embarqués.

Le défaut concerne donc les installations liées/symlinkées et l’usage direct depuis un checkout, précisément fréquent pendant le développement du produit.

**Preuves.**

- reproduction : `node bin/arka-norn.mjs selftest` → échec `npm_execpath absent` ;
- `scripts/selftest.mjs:126-133` lance directement `tests/run-tests.mjs` ;
- `tests/e2e/packaging.test.ts:9-10` exige `npm_execpath` ;
- `package.json:56` masque le problème via npm.

**Correction recommandée.** Résoudre npm de façon portable sans dépendre d’une variable injectée, ou faire du test packaging une gate séparée non appelée par le selftest direct. Ajouter un E2E qui supprime explicitement `npm_execpath`.

### F08 — P3 — L’aide de `validate` sur-promet son contrôle

**Fait confirmé.**

L’aide principale annonce « Valide structure, identité et relations ». Le use case appelé par `arka-norn validate <document>` charge un seul fichier, valide le schema et cherche les sentinelles de scaffold. Il ne charge ni Project, ni registre Agent, ni graphe de dépendances.

La skill `arka-framework-valider` décrit, elle, correctement ce comportement comme une validation de structure et de sentinelles.

**Preuves.**

- `src/adapters/inbound/cli/main-cli.ts:46` ;
- `src/application/pipeline/validate-pipeline-document.ts:6-20` ;
- la validation relationnelle complète existe dans `pipeline status/next`, sous réserve de F01.

**Correction recommandée.** Renommer l’aide en « Valide schéma et sentinelles » et orienter vers `pipeline status <feature>` pour identité, relations et verdict métier.

## 4. Conformités confirmées

- **Architecture :** le domaine reste indépendant de Node/adapters ; le typage TypeScript est strict.
- **Graphe :** GitNexus a indexé 11 208 nœuds, 25 630 relations, 161 communautés et 300 flows ; `gitnexus check --cycles` ne trouve aucun cycle.
- **Tests :** `npm run test:coverage` exécute 123 tests, tous passants.
- **Sécurité filesystem :** confinement canonique, refus des symlinks, limite JSON 2 Mio, temporaires exclusifs, `fsync`, modes POSIX et locks propriétaires sont implémentés et testés.
- **Persistance :** markers portables v3, index reconstructibles et écritures atomiques sous lock.
- **Pipeline :** schémas Ajv stricts, sentinelles refusées, IDs/dépendances/cycles/cardinalités et politiques QA/FastDev couverts.
- **Audit trail :** intention obligatoire avant mutation, succès/échec, rotation et redaction des secrets.
- **Dépendances :** une dépendance runtime directe (`ajv`) ; `npm audit --omit=dev` retourne 0 vulnérabilité.
- **Performance :** benchmark 50 Projects / 200 Features / 50 rapports en `82,14 ms` pour un budget total de `5 000 ms`.
- **Packaging :** `npm pack --dry-run --ignore-scripts` passe ; 348 entrées, 259 782 octets compressés, aucune source TypeScript ni test embarqué.
- **Secrets :** aucune clé privée, credential ou token correspondant aux motifs contrôlés dans les fichiers suivis.
- **Git :** worktree propre et branche synchronisée au début et après les commandes de preuve.

## 5. Invariants candidats à figer

1. Une Feature marquée ne produit jamais de `PipelineReport` sans registre Agent valide.
2. Toute impossibilité de vérifier un auteur v3 est un état invalide, jamais un warning compatible avec le code `0`.
3. `doctor.ok` signifie que toutes les conditions obligatoires d’usage sont présentes ; une skill core absente est obligatoire.
4. Toute action TUI asynchrone capture son erreur et sérialise les validations utilisateur.
5. Une commande publique critique doit disposer d’une couverture mesurée, pas seulement de tests qui s’exécutent hors instrumentation.
6. Aucun document framework ne doit exiger un identifiant métier qui n’existe pas dans le scope annoncé par sa skill.

## 6. Dettes et ordre de traitement recommandé

1. **Lot A — intégrité Pipeline (bloquant) :** fermer F01 et ajouter les tests de non-régression CLI/TUI.
2. **Lot B — contrat de santé (bloquant release) :** fermer F02 et F04, puis rejouer le cas utilisateur `0/8` et l’installation en session.
3. **Lot C — robustesse TUI :** fermer F03 et sérialiser les menus secondaires.
4. **Lot D — qualité/release :** fermer F05 et F07 ; faire échouer la CI si la CLI reste non mesurée.
5. **Lot E — contrat méthodologique :** arbitrer F06 avant de produire d’autres audits Project.
6. **Lot F — documentation :** fermer F08 et mettre à jour les guides après stabilisation des comportements.

## 7. Preuves exécutées

```text
gitnexus index .
  11 208 nodes · 25 630 edges · 161 clusters · 300 flows

gitnexus check --cycles --json -r arka-norn
  clean · 0 cycle

npm run test:coverage
  123 pass · 0 fail
  lines 72.08% · functions 76.37% · branches 74.82%

npm audit --omit=dev
  found 0 vulnerabilities

npm run benchmark
  82.14 ms / budget 5 000 ms · ok=true

npm_config_cache=/private/tmp/arka-norn-audit-npm-cache npm pack --dry-run --ignore-scripts --json
  succès · 348 fichiers · 259 782 octets

node bin/arka-norn.mjs selftest
  54/55 · FAIL tests TypeScript : npm_execpath absent
```

## 8. Conclusion

La remédiation du 19 août a réellement renforcé le produit et la majorité de ses garanties sont prouvées. Le nouvel audit révèle toutefois une faiblesse systémique autour de la disponibilité du registre : le moteur sait contrôler l’identité, mais les interfaces peuvent choisir de ne pas lui fournir les données nécessaires. Tant que ce fail-open subsiste, un statut vert ne constitue pas une preuve suffisante de conformité documentaire.

Le second point bloquant est le sens de `doctor.ok`. L’alignement CLI/TUI est maintenant meilleur, mais il expose que la règle centrale est trop permissive pour les skills core. La prochaine phase doit corriger ces contrats puis rejouer les scénarios reproduits, sans mélanger cette observation avec l’implémentation.

## Addendum de reprise v1.2.0 — F09–F10

La mise en œuvre de F01–F08 a été suivie d'une revue de sécurité sur les
frontières persistées et les écritures de preuve. Deux écarts supplémentaires
ont été confirmés puis fermés dans le même lot versionné.

| ID | Priorité | Nature | Résumé |
|---|---:|---|---|
| F09 | P1 | Intégrité des frontières | Un cache Project/Feature ou un marker symbolique pouvait tenter de redéfinir une identité ou un confinement réel. |
| F10 | P1 | Intégrité des preuves | Un scaffold pouvait viser une zone réservée et le journal d'audit ne distinguait pas un fichier final lié à une autre destination. |

### F09 — Les indexes ne sont plus des sources d'identité

Chaque Project ou Feature lu depuis un index est désormais rechargé depuis son
marker réel, dont l'identité, le confinement et l'absence de symlink sont
vérifiés avant usage. Les chemins de la CLI Pipeline, FastDev et TUI consomment
le même contexte vérifié. Les régressions couvrent un index Project falsifié,
une Feature hors Project, les markers symboliques et les migrations.

### F10 — Les écritures restent confinées et auditables

Tout scaffold refuse les segments réservés `.arka-norn`, y compris avec
`--force`; l'audit Project refuse une Feature ou un Project imbriqué. Chaque
scaffold écrit d'abord une intention dans le journal et s'arrête si cette
preuve ne peut pas être produite. Le fichier `audit.jsonl` est vérifié comme
fichier régulier à lien unique : symlink, fichier spécial et hardlink externe
sont refusés avant ouverture. Les tests conservent explicitement inchangé le
contenu externe d'un hardlink refusé.

### Verdict de l'addendum

F09 et F10 sont corrigés et couverts par des tests unitaires, d'intégration et
E2E. La revue sécurité dédiée conclut GO ; le risque TOCTOU same-UID entre
contrôle et ouverture reste celui du modèle filesystem local et n'est pas un
contournement bloquant dans le périmètre retenu.
