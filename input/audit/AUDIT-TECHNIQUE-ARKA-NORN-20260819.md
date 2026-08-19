# Audit technique complet — arka-norn

| Champ | Valeur |
|---|---|
| Date | 2026-08-19 |
| Méthode appliquée | `/Users/jeremygrimonpont/workspace/ARKA_LABS/01_Owner/audit-methode.md` |
| Périmètre | Worktree local `arka-norn`, code, scripts, tests, documentation, build, package et configuration CI |
| Nature de l’intervention | Audit uniquement ; aucune correction du produit |
| Auditeur | Codex |

# 1. Résumé exécutif

arka-norn est un outil local-first en Node.js/TypeScript qui combine une CLI et une TUI pour gérer des `Project`, leurs `Feature`, un registre Agents, un pipeline documentaire en dix étapes, des runs de développement/QA et un catalogue de 15 skills multiprovider. Le stockage repose sur des markers et registres portables dans les projets et des index locaux reconstructibles sous le home utilisateur.

**Fait observé — confiance élevée.** Le cœur TypeScript suit une architecture hexagonale lisible : domaine pur, ports, cas d’usage, adapters filesystem/CLI/TUI et composition. Le projet dispose de schémas JSON stricts, d’un moteur de décision métier qui distingue validation structurelle et verdict QA, de protections de chemin, d’écritures atomiques, de tests unitaires/intégration/E2E et d’une documentation cohérente sur l’intention générale.

**Inférence raisonnable — confiance élevée.** Le niveau de maturité probable est celui d’un **MVP avancé ou outil interne en phase de durcissement**, pas encore d’un produit distribué et exploité de manière démontrée. Le dépôt a un remote Git, mais aucun `HEAD` local : tous les fichiers du produit sont non suivis. La CI est donc définie mais aucune exécution issue de cet état ne peut être observée.

**Criticité probable : modérée à élevée.** L’outil n’expose pas de service réseau ni de données client distantes, mais il arbitre l’état de livraison, écrit des markers, des index, des skills et des backups. Une erreur d’intégrité peut donc produire de faux diagnostics, désynchroniser le cockpit ou guider un agent vers une mauvaise prochaine action.

**Niveau global de qualité technique : moyen.** Le socle est nettement supérieur à un prototype : architecture, typage strict, tests et sécurité filesystem sont réels. En revanche, quatre défauts ont été reproduits directement hors de la suite existante : violation de propriété lors de la reprise d’un lock stale, handoffs non validés et invisibles dans le rapport, `doctor` en faux PASS sur un index invalide, et `doctor` ignorant `ARKA_NORN_HOME` tout en acceptant des options inconnues.

Forces principales :

- domaine Pipeline testable et indépendant du terminal/filesystem ;
- dépendances runtime minimales ;
- schémas JSON stricts et règle QA liée au dernier CR ;
- politiques de chemin, limites de taille, permissions et écritures atomiques ;
- 65 tests actuellement verts et selftest 51/51 ;
- documentation, ADRs et contrat CLI déjà structurés ;
- package allowlisté, sans `src`, `tests` ni dossiers d’audit.

Faiblesses principales :

- aucune baseline Git exploitable et donc aucune preuve de CI distante ;
- protocole de lock incorrect en cas de reprise stale ;
- support transversal des handoffs annoncé mais non intégré au moteur ;
- diagnostic `doctor` moins strict que les stores qu’il prétend diagnostiquer ;
- rattachement/versionnement inter-documents incomplet hors CR/QA ;
- parsing CLI fragmenté et permissif selon les commandes ;
- audit trail best-effort pouvant échouer silencieusement ;
- preuve de packaging “propre” dépendant encore du `node_modules` du worktree ;
- tests TUI principalement headless et de rendu, sans scénario interactif complet ;
- absence de vraie analyse statique TypeScript et de métrique de couverture.

**Niveau de risque global : modéré à élevé tant que les quatre défauts confirmés ne sont pas corrigés.** Le projet peut évoluer rapidement grâce à son découpage, mais une accélération immédiate sur de nouvelles features augmenterait la dette de contrat. La décision recommandée est : stabiliser les invariants de concurrence, de diagnostic et de graphe documentaire, établir la baseline Git/CI, puis refactorer progressivement. Une réécriture globale n’est pas justifiée.

# 2. Scorecard d’audit

| Dimension | Note / 5 | Justification synthétique |
|---|---:|---|
| Architecture et structure | 4 | Domaine/ports/adapters cohérents ; composition TUI et installateur JS encore trop centraux. |
| Qualité du code | 3 | TypeScript strict et intentions claires, mais duplication JS/TS, commentaires périmés et contrats partiellement appliqués. |
| Maintenabilité | 3 | Modules globalement localisables ; plusieurs gros fichiers et parseurs/présentateurs dispersés augmentent le coût d’évolution. |
| Bonnes pratiques | 3 | Immutabilité, injection et fail-fast présents ; diagnostic, audit trail et transactions multi-fichiers restent incomplets. |
| Sécurité | 3 | Bon durcissement filesystem et audit npm vert ; lock stale incorrect et chaîne CI non épinglée par SHA. |
| Tests et fiabilité | 4 | 65 tests, trois niveaux et scénarios sécurité ; lacunes sur stale lock, handoffs, doctor strict et navigation TUI réelle. |
| Performance potentielle | 3 | Acceptable pour un petit portefeuille local ; double inspection par Feature et chargements séquentiels limitent l’échelle. |
| Observabilité et exploitation | 2 | Logger structuré et audit JSONL présents, mais erreurs d’audit silencieuses, pas de rotation et doctor non fiable sur certains états. |
| DevEx / onboarding / industrialisation | 3 | README, ADRs, scripts et CI présents ; aucun commit initial, lint nominal et release publique non définie. |

**Score global : 3,1 / 5.**

**Niveau de confiance de l’audit : élevé** sur le code local et les comportements reproduits ; moyen sur l’exploitation réelle.

Limites du périmètre :

- Exécutions GitHub Actions distantes : **non observables dans le périmètre fourni**.
- Environnements de production/staging, volumétrie réelle et incidents : **non observables dans le périmètre fourni**.
- Métrique de couverture de code : **non observable dans le périmètre fourni**, car aucun outil ou rapport de couverture n’est configuré.
- Gouvernance de branche, revue humaine et processus de release : **non observables dans le périmètre fourni**.
- Tests sur Node 20/24, Linux et Windows : déclarés dans la CI, mais leur résultat réel est **non observable dans le périmètre fourni**.
- Benchmark de performance ou profil mémoire : **non observable dans le périmètre fourni**.

# 3. Analyse détaillée par domaine

## 3.1 Structure et découpage

### Constat S1 — Frontières hexagonales globalement utiles

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `src/domain/` n’accède pas à Node ; les contrats vivent sous `src/ports/` ; les cas d’usage Project/Feature reçoivent leurs dépendances ; les adapters concrets sont sous `src/adapters/`.
- **Périmètre :** structurel.
- **Impact :** le moteur Pipeline et les règles de persistance peuvent être testés sans TUI ni process réel.
- **Gravité :** faible, constat positif.
- **Recommandation :** préserver cette direction et interdire les nouveaux accès filesystem/process hors adapters.

### Constat S2 — Deux architectures coexistent encore pour les commandes

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `bin/arka-norn.mjs` route vers onze scripts JS ; `scripts/install.mjs` contient 328 lignes de planification, génération, sécurité, backup et rollback ; `DirectSkillManager` charge dynamiquement ce module JS (`src/adapters/outbound/skills/direct-skill-manager.ts:31-69`). `scripts/lib.mjs` réimplémente validation Ajv et sentinelles à côté de `AjvDocumentValidator` et du runtime TypeScript.
- **Périmètre :** transversal.
- **Impact :** deux modèles d’erreur, de parsing et de typage doivent évoluer ensemble ; l’installateur échappe au typage strict du cœur.
- **Gravité :** moyen.
- **Recommandation :** porter install/skills/migrate et le routage CLI dans des adapters TypeScript typés, puis conserver des entrypoints JS de quelques lignes au maximum.

### Constat S3 — La composition TUI est trop centrale

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `src/composition/container.ts` compte 357 lignes et orchestre création des runtimes, navigation, confirmations, pipeline, skills, rendu des erreurs et calcul d’agrégats.
- **Périmètre :** transversal.
- **Impact :** chaque nouvelle action TUI augmente le risque de couplage et rend les scénarios difficiles à tester en isolation.
- **Gravité :** moyen.
- **Recommandation :** extraire des contrôleurs de scène ou workflows applicatifs (`project-controller`, `feature-controller`, `skills-controller`) et limiter le container au câblage.

## 3.2 Qualité du code

### Constat Q1 — Typage et invariants locaux solides

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `tsconfig.json` active `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnused*` et `noFallthroughCasesInSwitch`.
- **Périmètre :** transversal.
- **Impact :** de nombreuses erreurs de contrats sont détectées avant exécution.
- **Gravité :** faible, constat positif.
- **Recommandation :** conserver ces options et étendre le typage aux scripts JS encore structurants.

### Constat Q2 — Commentaires et contrats ne correspondent pas toujours au code

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** le commentaire de `create-feature.ts:11-13` annonce “index puis marker, avec rollback”, alors que le code écrit le marker puis l’index (`create-feature.ts:71-80`) sans rollback. Cette séquence peut être valide puisque l’index est reconstructible, mais le commentaire décrit l’inverse.
- **Périmètre :** localisé mais révélateur.
- **Impact :** un mainteneur peut “corriger” le code dans la mauvaise direction ou déduire une garantie transactionnelle inexistante.
- **Gravité :** faible à moyen.
- **Recommandation :** supprimer les commentaires historiques de portage et documenter uniquement les invariants actuels.

### Constat Q3 — Le lint ne lint pas réellement le TypeScript

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `tests/lint.mjs:6-33` exécute uniquement `node --check` sur les `.mjs`. Aucun ESLint, Biome ou règle de complexité/import n’apparaît dans le manifest ou le lockfile.
- **Périmètre :** transversal.
- **Impact :** le script nommé `lint` ne détecte ni imports interdits, ni promesses flottantes, ni complexité excessive, ni incohérences TypeScript.
- **Gravité :** moyen.
- **Recommandation :** renommer le contrôle actuel en `check:js-syntax` et ajouter une analyse statique TypeScript ciblée sur les risques réels.

## 3.3 Architecture métier

### Constat A1 — La règle dernier CR + QA est correctement matérialisée

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `evaluate-pipeline.ts:29-40` sélectionne le dernier CR, filtre les QA par `crDevId` et signale les QA passantes obsolètes ; les branches `fail` et `partial` produisent des next actions explicites (`:162-170`).
- **Périmètre :** structurel.
- **Impact :** le faux “Pipeline complet” sur une QA obsolète ou en échec est évité.
- **Gravité :** faible, constat positif.
- **Recommandation :** conserver cette règle comme invariant de domaine.

### Constat A2 — Les handoffs transversaux sont acceptés sans validation puis perdus

- **Nature :** risque confirmé par observation et reproduction.
- **Confiance :** élevée.
- **Preuves :** `inspect-pipeline.ts:30-34` valide uniquement un type trouvé dans `steps`; un type transversal reçoit `{valid: true}`. `evaluate-pipeline.ts:14-20` le classe “connu”, puis aucun état ou champ de rapport ne le conserve. `feature-cockpit.ts:36` compte les handoffs en recherchant le mot dans les warnings, pas les documents. Reproduction : un `11-handoff.json` réduit à `{"type":"handoff"}` n’ajoute ni erreur, ni warning, ni unknown file ; l’exemple valide présent sur disque produit `handoffSignals: 0`.
- **Périmètre :** structurel.
- **Impact :** le cockpit annonce des handoffs mais affiche une valeur fausse ; un handoff invalide peut être accepté silencieusement ; la passation inter-agent n’est pas traçable par le rapport.
- **Gravité :** élevé.
- **Recommandation :** valider chaque type transversal avec son schema, ajouter `transversalDocuments` au `PipelineReport`, compter les handoffs réels et tester valid/invalid/multiples.

### Constat A3 — Le graphe d’identité des documents est partiel

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** seuls `cr-dev.schema.json` et `recette-qa.schema.json` exigent `schema_version`, `feature_id`, `sequence` et `created_at`. Les huit autres schémas et le handoff ne portent pas ce rattachement. `evaluate-pipeline.ts:23-26` vérifie l’appartenance uniquement si `featureId` est présent. Aucune règle ne rejette deux IDs identiques ni plusieurs documents pour une étape `multiple: false`.
- **Périmètre :** structurel.
- **Impact :** des documents copiés depuis une autre Feature peuvent être acceptés ; la sélection et la traçabilité sont ambiguës ; le produit ne peut pas garantir l’unicité annoncée des artefacts.
- **Gravité :** élevé.
- **Recommandation :** versionner tous les documents, exiger `feature_id` et `created_at`, imposer l’unicité des IDs, valider les cardinalités et rendre les relations CR → spec/tâches explicites par identifiants.

## 3.4 Sécurité

### Constat SEC1 — Les protections filesystem sont substantielles

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `FsPathPolicy` canonise par `realpath`, refuse les roots symboliques, vérifie le confinement avec `path.relative` et contrôle les sorties ; `atomic-json.ts` limite les lectures à 2 Mio, utilise un temporaire `wx`, `fsync`, rename et permissions explicites ; les tests couvrent traversal, symlink, marker forgé, corruption et concurrence nominale.
- **Périmètre :** transversal.
- **Impact :** le risque de path traversal et d’écrasement involontaire est nettement réduit.
- **Gravité :** faible, constat positif.
- **Recommandation :** conserver la politique centrale et ajouter des tests TOCTOU/ancêtres remplacés.

### Constat SEC2 — La reprise d’un lock stale casse la propriété du verrou

- **Nature :** risque confirmé par reproduction.
- **Confiance :** élevée.
- **Preuves :** `file-lock.ts:27-29` supprime un lock jugé stale ; l’ancien détenteur exécute ensuite systématiquement `unlink(lockPath)` en `finally` (`:35-40`) sans vérifier qu’il supprime encore son propre lock. Reproduction contrôlée : A est repris par B, A termine et supprime le lock de B, puis C entre pendant que B tient encore sa section critique (`cEnteredWhileBHolds: true`).
- **Périmètre :** transversal aux index et à l’audit trail.
- **Impact :** plusieurs writers peuvent entrer simultanément, entraînant perte de mise à jour ou journal incomplet. Les index sont reconstructibles, mais l’audit trail ne l’est pas forcément.
- **Gravité :** élevé.
- **Recommandation :** donner un token unique au détenteur, vérifier token/inode avant suppression, ou utiliser une primitive de lock éprouvée ; tester explicitement reprise stale + ancien détenteur + troisième writer.

### Constat SEC3 — Dépendances runtime minimales et audit actuel vert

- **Nature :** fait observé.
- **Confiance :** élevée au 2026-08-19.
- **Preuves :** une seule dépendance runtime directe (`ajv`) ; `npm audit --omit=dev` retourne `found 0 vulnerabilities`.
- **Périmètre :** transversal.
- **Impact :** surface supply chain limitée.
- **Gravité :** faible, constat positif.
- **Recommandation :** maintenir le lockfile, l’audit CI et une cadence de mise à jour maîtrisée.

## 3.5 Tests et fiabilité

### Constat T1 — Bonne pyramide de tests pour le cœur local

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** exécution directe `npm test` : 65/65 tests passants ; suites unitaires, intégration et E2E ; `npm run check` et selftest : 51/51. Les tests couvrent Pipeline, stores, migration, skills, CLI, packaging et plusieurs cas sécurité.
- **Périmètre :** transversal.
- **Impact :** bonne capacité de prévention des régressions connues.
- **Gravité :** faible, constat positif.
- **Recommandation :** conserver les tests de comportement et ajouter les cas révélés par cet audit.

### Constat T2 — Les tests TUI ne prouvent pas un parcours interactif complet

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `tui-cockpit.test.ts` instancie et rend directement une vue ; `tui-project-vocabulary.test.ts` compare deux rapports ; `tui-runtime.test.ts` teste largeur, scroll et hauteur. Aucun test ne pilote une séquence clavier complète Home → Project → Feature → mutation avec la composition de production.
- **Périmètre :** transversal TUI.
- **Impact :** les races de navigation, double Enter, empilement/dépilement de scènes et erreurs asynchrones restent peu protégés.
- **Gravité :** moyen à élevé.
- **Recommandation :** créer un input contrôlé et tester les parcours critiques avec adapters temporaires, y compris double événement et échec d’une action.

### Constat T3 — La preuve de package propre réutilise les dépendances du worktree

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `packaging.test.ts:28` symlink le `node_modules` courant dans le staging, puis `:55` le symlink encore dans le package extrait avant le smoke test.
- **Périmètre :** release.
- **Impact :** le test valide l’allowlist et les entrypoints, mais ne prouve pas qu’un clone vierge peut faire `npm ci`, packer, installer le tarball et démarrer sans dépendance implicite locale.
- **Gravité :** moyen.
- **Recommandation :** ajouter en CI un job depuis checkout propre qui exécute `npm ci`, `npm pack`, installe le tarball dans un consumer vierge puis lance plusieurs commandes.

## 3.6 Performance et scalabilité

### Constat P1 — Double évaluation complète par Feature lors des refresh Project

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `project-detail-view.ts:117-124` demande séparément `statusForFeature` puis `metricsForFeature`; `container.ts:298-299` implémente chaque callback par un `pipeline.inspect` complet. Chaque inspection recharge la définition et relit tous les JSON de la Feature.
- **Périmètre :** transversal au dashboard Project.
- **Impact :** coût approximatif doublé à chaque refresh, visible avec de nombreux projets/features ou sur volume lent.
- **Gravité :** moyen.
- **Recommandation :** calculer un seul `PipelineReport` par Feature et dériver statut + métriques du même objet, avec cache invalidé par mtime si nécessaire.

### Constat P2 — Réhydratation séquentielle des index

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `list-projects.ts:9-19` et `list-features.ts:20-34` chargent les markers un par un dans une boucle `await`.
- **Périmètre :** transversal aux listes.
- **Impact :** latence linéaire séquentielle ; acceptable pour un petit portefeuille local, moins pour plusieurs centaines de racines ou des volumes réseau.
- **Gravité :** faible à moyen dans le contexte probable.
- **Recommandation :** introduire une concurrence bornée et conserver l’ordre déterministe.

**Point à vérifier manuellement — confiance faible :** la volumétrie réelle et les temps de réponse acceptables sont non observables. Aucun benchmark ne permet d’affirmer une dégradation mesurée.

## 3.7 Erreurs, logs et observabilité

### Constat O1 — `doctor` peut déclarer PASS sur un index que le store rejettera

- **Nature :** défaut confirmé par reproduction.
- **Confiance :** élevée.
- **Preuves :** `fs-doctor.ts:64-67` vérifie seulement `schemaVersion === 2` et `Array.isArray(entries)`. Les stores valident chaque entrée (`fs-project-index-store.ts:118-128`, équivalent Feature). Reproduction : `{schemaVersion:2, entries:[{}]}` avec mode `0600` retourne `status: pass`, `message: index valid and private`.
- **Périmètre :** transversal au diagnostic/récupération.
- **Impact :** faux vert opérationnel ; l’utilisateur croit l’index sain alors que le prochain store le classera corrompu et reviendra à un cache vide.
- **Gravité :** élevé.
- **Recommandation :** partager un codec/validator unique entre stores et doctor ; ajouter des fixtures d’entrées mal formées.

### Constat O2 — L’audit trail est best-effort, silencieux et sans rotation

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `management-runtime.ts:116-118` absorbe toute erreur d’audit et écrit seulement un `warn`; le logger est créé avec seuil `error` par défaut (`:38-40`), donc ce warn n’est pas visible. `fs-audit-trail.ts` append dans un fichier JSONL unique sans rotation ni limite.
- **Périmètre :** transversal.
- **Impact :** une mutation peut réussir sans trace et sans signal utilisateur ; le fichier peut croître sans borne.
- **Gravité :** moyen à élevé si la traçabilité est une promesse produit.
- **Recommandation :** retourner un warning structuré à la CLI/TUI, compter les échecs, implémenter rotation/taille maximale et tester disque plein/permissions.

### Constat O3 — Les markers illisibles disparaissent des listes

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `list-projects.ts:9-19` et `list-features.ts:22-34` catchent l’erreur, loggent un warning puis omettent l’entité. Avec le seuil `error`, le warning est généralement masqué.
- **Périmètre :** transversal.
- **Impact :** une ressource cassée ressemble à une ressource absente, ce qui complique le diagnostic et peut pousser à la recréer.
- **Gravité :** moyen.
- **Recommandation :** exposer des entrées “unhealthy” dans les view models et les réponses CLI plutôt que les supprimer silencieusement.

## 3.8 CI/CD et déploiement

### Constat C1 — Aucun état Git versionné n’existe

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `git rev-parse --verify HEAD` échoue avec “Needed a single revision” ; `git status` classe tout le produit en `??`. Un remote `origin` existe mais aucun commit local n’est disponible.
- **Périmètre :** structurel.
- **Impact :** pas de revue diff fiable, rollback, tag, bisect, provenance, CI déclenchable depuis cet état ou reconstruction depuis un clone.
- **Gravité :** élevé.
- **Recommandation :** créer une baseline revue, explicite et atomique avant toute nouvelle feature ; protéger ensuite la branche et imposer les checks.

### Constat C2 — CI ambitieuse mais non prouvée et actions non épinglées par SHA

- **Nature :** fait observé pour la configuration ; exécution non observable.
- **Confiance :** élevée sur le fichier, moyenne sur le comportement distant.
- **Preuves :** `.github/workflows/ci.yml` déclare 3 OS × 3 versions Node, `npm ci`, tests, build, pack et audit. `actions/checkout@v4` et `actions/setup-node@v4` utilisent des tags majeurs mutables, pas des commits SHA.
- **Périmètre :** supply chain et industrialisation.
- **Impact :** bonne intention de portabilité, mais aucune preuve de succès ; dépendance à des références d’actions mutables.
- **Gravité :** moyen.
- **Recommandation :** exécuter la matrice depuis la baseline, corriger les cellules, puis pinner les actions par SHA avec outil de mise à jour automatisé.

### Constat C3 — Contrat de release ambigu

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `package.json:4` porte `private: true`, alors que README décrit `npm link` et que le package est préparé/packé. Aucun script de release, tag, changelog, licence ou provenance n’est visible.
- **Périmètre :** release.
- **Impact :** impossible de savoir si la distribution cible est uniquement interne, par tarball, via registry privée ou publique.
- **Gravité :** moyen.
- **Recommandation :** formaliser le canal de distribution, le versioning, les artefacts, la licence, la signature/provenance et le rollback.

## 3.9 Documentation et onboarding

### Constat D1 — Documentation utile mais quelques promesses sont plus fortes que le code

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** README, ADRs, docs CLI/TUI/sécurité/skills sont présents. Cependant `docs/tui.md:6-7` promet compteurs et handoffs alors que le rapport ne les transporte pas ; `docs/architecture.md:3` affirme une même logique pour “CLI, TUI, skills et tests” malgré l’installateur JS et la validation dupliquée de `scripts/lib.mjs`.
- **Périmètre :** transversal.
- **Impact :** un décideur peut surestimer la complétude du cockpit et de la source unique.
- **Gravité :** moyen.
- **Recommandation :** lier chaque promesse majeure à un test de contrat et corriger la documentation jusqu’à implémentation réelle.

### Constat D2 — Références de produit héritées dans les schémas

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `handoff.schema.json:5` et `recette-qa.schema.json:5` décrivent encore le framework `cortex.deck`.
- **Périmètre :** localisé.
- **Impact :** confusion de propriété et copier-coller dans les artefacts générés.
- **Gravité :** faible.
- **Recommandation :** rendre les descriptions produit-neutres ou les aligner sur arka-norn.

## 3.10 Dépendances et hygiène technique

### Constat H1 — Surface de dépendance bien maîtrisée

- **Nature :** fait observé.
- **Confiance :** élevée.
- **Preuves :** `ajv` est la seule dépendance de production directe ; `package-lock.json` est présent ; `npm ls --all` est cohérent ; audit production : 0 vulnérabilité connue.
- **Périmètre :** transversal.
- **Impact :** maintenance et exposition supply chain limitées.
- **Gravité :** faible, constat positif.
- **Recommandation :** conserver cette sobriété.

### Constat H2 — Types Node plus récents que la version minimale supportée

- **Nature :** risque probable, non démontré comme bug actuel.
- **Confiance :** moyenne.
- **Preuves :** engine `node >=20.11`, mais `@types/node` est en version 26.2.0.
- **Périmètre :** build/compatibilité.
- **Impact :** le compilateur peut autoriser à l’avenir une API absente de Node 20 sans alerte.
- **Gravité :** faible à moyen.
- **Recommandation :** aligner les types sur la plus ancienne LTS supportée ou ajouter un contrôle d’API runtime explicite.

# 4. Top problèmes prioritaires

## 1. Le produit n’a aucune baseline Git

- **Description :** aucun `HEAD`; tout le projet et la CI sont non suivis.
- **Éléments observables :** échec de `git rev-parse --verify HEAD`, `git status` uniquement en `??`.
- **Pourquoi c’est problématique :** les gates locaux ne sont rattachés à aucun état immuable ; impossible d’auditer un diff, revenir en arrière ou prouver une release.
- **Impact business / produit / technique :** risque de perte, de mélange de périmètre et de livraison non reproductible.
- **Gravité :** élevé.
- **Effort :** faible à moyen.
- **Périmètre :** structurel.
- **Action recommandée :** revue de scope, premier commit explicite, push contrôlé, protection de branche et checks obligatoires.

## 2. La reprise stale des locks viole l’exclusion mutuelle

- **Description :** l’ancien détenteur peut supprimer le lock du nouveau détenteur.
- **Éléments observables :** `file-lock.ts:27-40`; reproduction `cEnteredWhileBHolds: true`.
- **Pourquoi c’est problématique :** la garantie de sérialisation disparaît exactement dans un scénario de blocage ou de filesystem lent.
- **Impact :** perte de mise à jour d’index, audit incomplet, diagnostic incohérent.
- **Gravité :** élevé.
- **Effort :** moyen.
- **Périmètre :** transversal.
- **Action recommandée :** ownership token/inode, suppression conditionnelle, stratégie stale sûre et test à trois writers.

## 3. Les handoffs ne sont ni validés ni exposés

- **Description :** un handoff arbitraire est classé connu, déclaré implicitement valide puis oublié.
- **Éléments observables :** `inspect-pipeline.ts:30-34`, `evaluate-pipeline.ts:14-20`, `feature-cockpit.ts:36`; reproduction d’un handoff invalide sans erreur.
- **Pourquoi c’est problématique :** la passation multiprovider est une proposition de valeur centrale.
- **Impact :** faux compteurs, passations invisibles et artefacts non conformes acceptés.
- **Gravité :** élevé.
- **Effort :** moyen.
- **Périmètre :** structurel.
- **Action recommandée :** modèle transversal complet dans `PipelineReport`, validation Ajv et tests dédiés.

## 4. Le graphe documentaire n’assure pas l’identité complète des artefacts

- **Description :** version, Feature, date et séquence ne sont obligatoires que pour CR/QA ; cardinalités et IDs globaux ne sont pas contrôlés.
- **Éléments observables :** inventaire des schémas ; garde conditionnelle `evaluate-pipeline.ts:23-26`.
- **Pourquoi c’est problématique :** un document d’une autre Feature peut satisfaire une étape.
- **Impact :** mauvaise décision Pipeline et traçabilité insuffisante.
- **Gravité :** élevé.
- **Effort :** élevé.
- **Périmètre :** structurel.
- **Action recommandée :** format v2 commun, migration, unicité des IDs, validation des cardinalités et relations explicites.

## 5. `doctor` produit des faux PASS

- **Description :** son validateur d’index ne vérifie pas les entrées.
- **Éléments observables :** `fs-doctor.ts:64-67`; reproduction `{entries:[{}]}` → `pass`.
- **Pourquoi c’est problématique :** le diagnostic de récupération est moins strict que le code de lecture réel.
- **Impact :** incident mal diagnostiqué et cache remis à vide au prochain accès sans anticipation.
- **Gravité :** élevé.
- **Effort :** faible à moyen.
- **Périmètre :** transversal.
- **Action recommandée :** codec commun store/doctor et tests de toutes les entrées invalides.

## 6. Le routeur CLI est fragmenté et permissif

- **Description :** chaque script parse différemment ; certaines options sont ignorées.
- **Éléments observables :** `doctor --bogus --json` retourne 0 ; `project list --name ignored --json` retourne 0 ; `scripts/doctor.mjs:5-14` n’utilise pas `readEnv` et inspecte `os.homedir()`.
- **Pourquoi c’est problématique :** un script d’automatisation peut croire qu’une option est appliquée alors qu’elle est ignorée ; `doctor` peut diagnostiquer un autre home que le reste de la CLI.
- **Impact :** faux succès et réparation de la mauvaise cible.
- **Gravité :** élevé pour `doctor`, moyen globalement.
- **Effort :** moyen.
- **Périmètre :** transversal.
- **Action recommandée :** parser unique typé, allowlist par commande, `readEnv` commun et tests de rejet d’options.

## 7. L’audit trail peut disparaître silencieusement

- **Description :** toute erreur est absorbée, son warning est filtré et le fichier n’est pas borné.
- **Éléments observables :** `management-runtime.ts:38-40,116-118`, `fs-audit-trail.ts`.
- **Pourquoi c’est problématique :** la traçabilité est présentée comme garantie alors qu’elle est best-effort invisible.
- **Impact :** impossibilité de reconstituer certaines mutations et croissance disque sans limite.
- **Gravité :** moyen à élevé.
- **Effort :** moyen.
- **Périmètre :** transversal.
- **Action recommandée :** warning public, métrique/health, rotation et tests d’échec.

## 8. Les parcours TUI asynchrones ne sont pas suffisamment verrouillés/testés

- **Description :** `ProjectDetailView` déclenche `void select()` et `void submit()` sans état `busy`, tandis que les tests rendent surtout des vues isolées.
- **Éléments observables :** `project-detail-view.ts:68-92,129-145`; tests TUI actuels.
- **Pourquoi c’est problématique :** double Enter ou action lente peut déclencher deux scans/imports/navigations concurrents.
- **Impact :** UX incohérente, scènes dupliquées et mutations concurrentes.
- **Gravité :** moyen à élevé.
- **Effort :** moyen.
- **Périmètre :** transversal TUI.
- **Action recommandée :** contrôleur async sérialisé, busy state commun et tests clavier complets.

## 9. La preuve de release propre est incomplète

- **Description :** le test de packaging réutilise deux fois le `node_modules` local et le package reste `private` sans politique de release.
- **Éléments observables :** `packaging.test.ts:28,55`, `package.json:4`, absence de script/tag/licence de release.
- **Pourquoi c’est problématique :** un environnement local favorable peut masquer une dépendance ou un hook manquant.
- **Impact :** installation cassée pour un consommateur ou release non reproductible.
- **Gravité :** moyen.
- **Effort :** moyen.
- **Périmètre :** release.
- **Action recommandée :** consumer vierge, `npm ci`, install du tarball, smoke complet et politique de distribution explicite.

## 10. Le dashboard recalcule trop et les listes réhydratent séquentiellement

- **Description :** deux inspections complètes par Feature au refresh et I/O marker en série.
- **Éléments observables :** `project-detail-view.ts:117-124`, `container.ts:298-299`, `list-projects.ts:9-19`, `list-features.ts:20-34`.
- **Pourquoi c’est problématique :** le coût augmente rapidement avec le portefeuille.
- **Impact :** TUI lente et temps d’attente avant affichage.
- **Gravité :** moyen.
- **Effort :** faible à moyen.
- **Périmètre :** transversal.
- **Action recommandée :** un rapport par Feature, concurrence bornée et mesure sur un dataset synthétique.

# 5. Quick wins

1. **Créer la baseline Git.** Intervenir sur le dépôt entier après revue de scope. Rentable immédiatement : provenance, rollback, CI et diff deviennent possibles.
2. **Partager le validateur d’index entre stores et doctor.** Intervenir dans `fs-doctor.ts` et les codecs d’index. Élimine rapidement un faux PASS confirmé.
3. **Faire utiliser `readEnv` à doctor et rejeter toute option inconnue.** Intervenir dans `scripts/doctor.mjs`. Réduit le risque de diagnostiquer/réparer le mauvais home.
4. **Valider les handoffs avec le schema existant.** Intervenir dans `inspect-pipeline.ts`. Le schema est déjà disponible ; le gain de fiabilité est immédiat.
5. **Ajouter les handoffs réels au rapport et au cockpit.** Intervenir dans `pipeline-report.ts`, `evaluate-pipeline.ts` et les view models. Corrige une promesse produit visible.
6. **Éviter la double inspection par Feature.** Intervenir dans le contrôleur Project/TUI. Un seul appel fournit déjà toutes les métriques nécessaires.
7. **Rendre visible un échec d’audit trail.** Intervenir dans `management-runtime.ts` et les enveloppes CLI/TUI. Faible changement, forte amélioration de diagnostic.
8. **Renommer le lint actuel et ajouter un vrai lint TS minimal.** Intervenir dans `package.json` et la CI. Évite une assurance trompeuse.
9. **Corriger les descriptions `cortex.deck`.** Intervenir dans les deux schémas concernés. Réduit la confusion documentaire à coût faible.
10. **Ajouter quatre tests de non-régression issus de cet audit.** Lock stale à trois writers, handoff invalide, doctor entrée invalide, doctor home/option inconnue.

# 6. Chantiers structurants

## Chantier 1 — Contrat documentaire v2 complet

- **Problème adressé :** identité, version, cardinalité et relations partielles.
- **Bénéfice attendu :** un Pipeline réellement portable et déterministe entre Features et agents.
- **Risque de mise en œuvre :** migration des documents existants et rupture de compatibilité.
- **Prérequis :** ADR de versionnement, fixtures v1/v2, migrateur idempotent et stratégie de compatibilité.

## Chantier 2 — Convergence CLI/skills/migration vers TypeScript

- **Problème adressé :** logique structurante dans les scripts JS et parseurs dispersés.
- **Bénéfice attendu :** contrats typés, erreurs homogènes, testabilité et réduction des duplications.
- **Risque de mise en œuvre :** régression des alias historiques.
- **Prérequis :** tests de contrat CLI complets et mapping des codes de sortie.

## Chantier 3 — Persistance concurrente avec ownership explicite

- **Problème adressé :** reprise stale incorrecte et transactions multi-fichiers best-effort.
- **Bénéfice attendu :** exclusion mutuelle démontrable et récupération fiable.
- **Risque de mise en œuvre :** portabilité Windows/POSIX et locks abandonnés.
- **Prérequis :** modèle d’état du lock, tests multiprocessus, injection du temps et scénarios de crash.

## Chantier 4 — Exploitabilité locale

- **Problème adressé :** ressources cassées masquées, audit silencieux et doctor partiel.
- **Bénéfice attendu :** incident local diagnostiquable sans inspection manuelle du home.
- **Risque de mise en œuvre :** bruit excessif si les états dégradés ne sont pas hiérarchisés.
- **Prérequis :** modèle de health commun, warnings structurés, politique de rotation et redaction.

## Chantier 5 — Chaîne de release reproductible

- **Problème adressé :** absence de baseline, package privé ambigu et test dépendant du worktree.
- **Bénéfice attendu :** artefact installable, traçable et vérifié sur les plateformes supportées.
- **Risque de mise en œuvre :** coûts CI et choix de registry/licence.
- **Prérequis :** décision produit sur le canal de distribution et le support Node/OS.

# 7. Risques sécurité

## Risques confirmés

1. **Intégrité concurrente des locks stale.** La reproduction prouve qu’un troisième writer peut entrer pendant que le second détient encore la section critique. Gravité élevée sur l’intégrité locale.
2. **Diagnostic de sécurité/permissions incomplet.** `doctor` peut certifier un index malformé et peut cibler un autre home que les commandes de gestion.
3. **Validation transversale absente.** Un handoff arbitraire est accepté comme type connu sans validation de son schema.

## Risques probables mais non démontrés

1. **TOCTOU sur les chemins.** La politique vérifie les chemins avant écriture ; un remplacement concurrent d’un ancêtre entre contrôle et mutation n’est pas couvert par un handle de répertoire. Pertinence surtout sur un environnement local hostile ou partagé.
2. **Supply chain GitHub Actions.** Les actions sont référencées par tags majeurs mutables, pas par SHA.
3. **Fuite par logs futurs.** Le logger accepte des champs arbitraires sans redaction centrale. Aucun secret n’est actuellement observé dans les appels inspectés, mais la protection n’est pas structurelle.
4. **Compatibilité runtime.** Les types Node 26 peuvent autoriser une API absente de Node 20 dans une évolution future.

## Vérifications manuelles recommandées

- Exécuter la matrice réelle Windows/Linux/macOS et Node 20/22/24.
- Tester les permissions et fsync sur Windows, volumes réseau et filesystem lent.
- Tester disque plein, home en lecture seule et interruption pendant install/migration/repair.
- Vérifier la politique de secrets des environnements CI et la branche protégée après création de la baseline.
- Auditer les artefacts publiés avec provenance/SBOM lorsque le canal de distribution est choisi.

## Éléments non observables empêchant de conclure

- Aucun backend, endpoint, authentification, autorisation, session, cookie ou token runtime n’est présent : ces sujets sont non applicables au code observé, et aucune protection externe ne peut être déduite.
- Configuration des secrets GitHub, permissions de repository et règles de branche : non observables.
- Menaces multi-utilisateurs réelles sur les machines cibles : non observables.
- Historique de vulnérabilités/incidents : non observable.

Éléments rassurants : aucun credential codé en dur n’a été trouvé par recherche ciblée ; les mentions de tokens dans les exemples sont descriptives ; l’audit npm production retourne 0 vulnérabilité connue à la date de l’audit.

# 8. Dette technique

## Dette court terme

- ownership des locks stale incorrect ;
- handoffs ignorés par le rapport ;
- doctor faux positif et mauvais home possible ;
- options CLI non uniformément validées ;
- commentaires périmés et références `cortex.deck` ;
- double inspection par Feature.

## Dette structurelle

- identité/version/relations non uniformes sur tous les documents ;
- logique install/skills/migration encore hors du cœur TypeScript ;
- container TUI trop central ;
- audit trail non contractualisé ;
- états dégradés supprimés des listes plutôt qu’exposés.

## Dette process / outillage

- aucun commit initial ;
- CI définie mais non prouvée ;
- lint nominal limité à la syntaxe JS ;
- pas de couverture mesurée ;
- package “propre” dépendant du `node_modules` local ;
- politique de release, licence, changelog et provenance absentes.

## Conséquences probables si rien n’est fait

- augmentation des faux verts/faux absents à mesure que le volume documentaire croît ;
- difficultés à diagnostiquer les corruptions et pertes de traces ;
- régressions TUI/CLI lors de l’ajout de commandes ;
- baisse de confiance dans le cockpit comme source de vérité ;
- release impossible à reproduire ou à attribuer précisément ;
- coût croissant pour migrer plus tard les documents vers une identité commune.

# 9. Plan d’action recommandé

## Immédiat

1. **Établir une baseline Git revue.** Objectif : rendre l’état actuel immuable, diffable et exécutable en CI. Effort : faible à moyen.
2. **Corriger le protocole stale lock.** Objectif : garantir qu’un détenteur ne peut supprimer que son propre lock. Effort : moyen.
3. **Valider et exposer les handoffs.** Objectif : supprimer le faux compteur et rejeter les handoffs invalides. Effort : moyen.
4. **Unifier le validateur d’index de doctor et des stores.** Objectif : éliminer les faux PASS. Effort : faible à moyen.
5. **Aligner doctor sur `readEnv` et le parser strict.** Objectif : diagnostiquer la même cible que le reste du produit et refuser les options ignorées. Effort : faible.
6. **Ajouter les tests de reproduction de l’audit.** Objectif : verrouiller les corrections ci-dessus. Effort : faible.

## Court terme

1. **Versionner et rattacher tous les documents à une Feature.** Objectif : identité et traçabilité homogènes. Effort : élevé.
2. **Valider l’unicité, la cardinalité et les relations inter-documents.** Objectif : faire du rapport une vraie preuve de cohérence. Effort : moyen à élevé.
3. **Sérialiser les actions TUI et tester un parcours clavier réel.** Objectif : éliminer les doubles mutations et prouver la navigation. Effort : moyen.
4. **Rendre l’audit trail observable et borné.** Objectif : signaler chaque perte de trace et éviter la croissance infinie. Effort : moyen.
5. **Remplacer le lint nominal par une analyse statique TypeScript.** Objectif : détecter promesses flottantes, frontières violées et complexité. Effort : faible à moyen.
6. **Créer un test d’installation depuis un consumer réellement vierge.** Objectif : prouver clone → ci → pack → install → run. Effort : moyen.
7. **Mesurer le dashboard sur un dataset synthétique.** Objectif : fixer un budget de latence et supprimer les inspections redondantes. Effort : faible à moyen.

## Moyen terme

1. **Porter install/skills/migration dans l’architecture TypeScript.** Objectif : source unique de parsing, erreurs, sécurité et transactions. Effort : élevé.
2. **Décomposer la composition TUI en contrôleurs testables.** Objectif : absorber de nouvelles features sans faire croître un container central. Effort : moyen à élevé.
3. **Construire un modèle de health unifié.** Objectif : exposer indexes, markers, locks, audit et skills sains/dégradés/réparables. Effort : élevé.
4. **Industrialiser la release.** Objectif : canal explicite, version, changelog, licence, provenance, actions pinnées et rollback. Effort : moyen à élevé.
5. **Introduire cache et concurrence bornée seulement après mesure.** Objectif : soutenir un portefeuille plus large sans complexité prématurée. Effort : moyen.

# 10. Conclusion franche

**Le projet est-il sain techniquement aujourd’hui ?**

Partiellement. Le cœur Pipeline, le typage, les protections filesystem et la base de tests sont sains pour un usage local contrôlé. Le produit n’est toutefois pas encore suffisamment fiable pour être présenté comme une source de vérité robuste en exploitation : le lock stale, les handoffs ignorés et les faux PASS de doctor contredisent directement ses garanties principales.

**Peut-il supporter une évolution produit rapide ?**

Oui, à condition de fermer d’abord les invariants de concurrence, de diagnostic et d’identité documentaire. L’architecture de domaine permet une évolution rapide ; les scripts JS parallèles, le container TUI central et les parseurs dispersés deviendront sinon des multiplicateurs de régression.

**Faut-il corriger localement, refactorer progressivement ou envisager une refonte partielle ?**

La bonne stratégie est une **correction immédiate ciblée**, suivie d’un **refactoring progressif**. Une réécriture globale n’est pas justifiée : elle ferait perdre un moteur métier déjà correct et une suite de tests utile. Une refonte partielle est pertinente uniquement pour trois zones : protocole de lock, modèle documentaire transversal/identitaire, et convergence des commandes JS vers des adapters TypeScript.

La décision nette est donc : **ne pas ajouter de nouvelles fonctionnalités majeures avant d’avoir créé la baseline Git et corrigé les quatre défauts confirmés ; ensuite poursuivre l’évolution sur l’architecture existante, sans réécriture générale.**
