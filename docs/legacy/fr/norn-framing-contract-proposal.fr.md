# Contrat du moteur de cadrage Norn — proposition

> Proposition de travail. Consommateurs nommés : future spécification d'intégration, implémentation du moteur et recette UX. La méthode et les raisons Product restent dans [`norn-framing-method-research.fr.md`](./norn-framing-method-research.fr.md) ; ce document ne les recopie pas.

## Conclusion proposée

Le cadrage doit devenir un service antérieur aux pipelines de livraison. Il maintient un unique `FramingPlan`, ciblant soit un Project, soit une Feature. Le Concept est sa projection pré-technique ; le Plan fondé est sa projection après confrontation. Une fois stabilisé, le même artefact produit soit des Features candidates, soit des Lots.

Les pipelines ne doivent plus calculer le cadrage à partir d'une succession de fichiers manquants. Ils consomment une révision publiée du plan et prennent en charge ce qui vient après : préparation technique complémentaire si nécessaire, exécution, audit de livraison et validation.

## Faits du code actuel

### L'entrée exige trop tôt une Feature et un pipeline

- La skill principale exige un identifiant de Feature et une session spécialisée avant toute entrée dans le produit (`.agents/skills/arka-norn/SKILL.md:20`).
- Elle ordonne de lire une seule action calculée, produire un seul document puis s'arrêter (`.agents/skills/arka-norn/SKILL.md:36`).
- La création d'une Feature lui attribue immédiatement le pipeline fourni ou le pipeline par défaut (`src/use-cases/features/create-feature.ts:62`).

Conséquence : le cadre actuel suppose déjà connus la cible, l'identité documentaire et le workflow que le cadrage devrait justement aider à établir.

### L'avancement est une projection de présence documentaire

- Une étape requise sans fichier est `not_started` (`src/domain/pipeline/evaluate-pipeline.ts:227`).
- Sa prochaine action devient systématiquement `create_document` (`src/domain/pipeline/evaluate-pipeline.ts:236`).
- Le pipeline complet matérialise Concept et Plan comme deux étapes à décision humaine, puis place l'audit après le Plan (`pipeline.json:8`).

Conséquence : le système conduit une chaîne documentaire. Il ne sait pas représenter un plan qui s'enrichit, une correction locale ou une confrontation qui modifie l'autorité d'une affirmation existante.

### Le Project ne peut pas encore porter le cadrage commun

- L'enveloppe documentaire canonique exige `feature_id` (`schemas/document-envelope.schema.json:6`).
- Le scaffold Project est explicitement limité au seul `current_state_audit` (`src/application/pipeline/scaffold-pipeline-document.ts:25`).

Conséquence : un cadrage de Project et un cadrage de Feature seraient forcément deux implémentations différentes si ce contrat restait la base.

### La sonde possède déjà une partie des données, mais ne décide pas de la capacité

- L'inspection construit un inventaire, des signaux et une empreinte (`src/adapters/outbound/audit/local-audit-collector.ts:52`).
- L'inventaire calcule des compteurs de fichiers, sources, tests et manifestes (`src/adapters/outbound/audit/local-audit-collector.ts:482`).
- Ces compteurs ne figurent pas dans `AuditInspection`, qui ne conserve que les signaux et recommandations (`src/domain/audit/audit-types.ts:84`).
- Les listes `source`, `tests` et `manifests` sont limitées à vingt éléments avant calcul de leur compteur (`src/adapters/outbound/audit/local-audit-collector.ts:486`).
- Les recommandations continuent à proposer une profondeur `inventory` aux modules probablement non applicables (`src/adapters/outbound/audit/local-audit-collector.ts:547`).

Conséquence : un dossier vide peut être décrit comme une collection de modules peu applicables, mais pas comme un état produit qui interdit l'audit et ouvre la conception greenfield.

### Le scope d'une mission est élargi à tout le Project

- La préparation d'orchestration part obligatoirement d'une Feature et de sa prochaine étape documentaire (`src/composition/orchestration-mission-planner.ts:119`).
- Le scope de mission est ensuite codé en dur à `["."]` malgré l'existence d'un calcul de scope relatif (`src/composition/orchestration-mission-planner.ts:135`).

Conséquence : le cadrage ne peut pas déléguer une lecture technique bornée par sa cible et ses preuves attendues.

### Norn Web impose encore l'ordre interne avant l'intention

- L'onboarding déclare quatre étapes fixes : identité, Project, Feature et résumé (`web/src/onboarding/onboarding.tsx:25`).
- Il persiste dès le départ le nom, l'identifiant et le pipeline de la future Feature (`web/src/onboarding/onboarding.tsx:42`).
- L'étape Feature crée réellement la ressource avec son dossier et son pipeline avant tout cadrage (`web/src/onboarding/onboarding.tsx:155`).
- Le rail numéroté rend cette séquence interne visible comme parcours obligatoire (`web/src/onboarding/onboarding.tsx:210`).
- Hors onboarding, la création de Feature redemande nom, dossier, workflow et identifiant dans une modale (`web/src/views/features-view.tsx:21`).
- La fiche Feature est organisée autour de la progression du pipeline et des documents (`web/src/views/feature-view.tsx:11`).

Conséquence : l'utilisateur doit comprendre l'objet Feature, choisir un workflow et fabriquer son emplacement avant que Norn ne l'aide à formuler ce qu'il cherche à obtenir. La reprise d'une route existe, mais la reprise de l'intention Product n'a aucune route ni vue dédiée.

## Frontière fonctionnelle

Le nouveau moteur introduit un agrégat `FramingPlan` indépendant de `PipelineReport`.

```text
Skill Norn
   ↓
Framing entry ──→ Project minimal / Project repris
   ↓
Repository probe
   ↓
FramingPlan vivant ←→ Conversation
   ↓                       ↓
Confrontation adaptée      Révisions atomiques
   ↓
Révision publiée
   ├── cible Project → Feature candidates
   └── cible Feature → Lots
                              ↓
                       Pipeline de livraison
```

Le moteur de pipeline ne décide plus comment cadrer. Le moteur de cadrage ne simule pas l'exécution. Leur contrat commun est une référence vers une révision publiée et la décomposition qu'elle autorise.

## Cible commune

Le contrat utilise une union discriminée, jamais un `feature_id` obligatoire avec valeur fictive.

```json
{
  "kind": "project",
  "project_id": "cortex-deck-3a7c6efe",
  "framing_id": "framing-project-cortex-deck"
}
```

ou :

```json
{
  "kind": "feature",
  "project_id": "cortex-deck-3a7c6efe",
  "framing_id": "framing-docs-remise-au-carre",
  "origin": "new",
  "feature_id": null,
  "working_title": "Remettre la documentation au carré"
}
```

Pour une Feature existante, `origin` vaut `existing` et `feature_id` contient son identifiant géré. Pour une nouvelle Feature, `framing_id` fournit l'identité stable de reprise avant que Norn connaisse légitimement son identifiant final, son dossier ou son pipeline.

Les invariants communs vivent une seule fois. La différence de cible n'apparaît que dans la décomposition finale et dans les permissions de matérialisation.

## Forme minimale du plan vivant

L'exemple ci-dessous décrit la structure sémantique recommandée. Ce n'est pas encore le JSON Schema public.

```json
{
  "schema_version": 1,
  "id": "framing-plan-01J6...",
  "target": {
    "kind": "feature",
    "project_id": "project-id",
    "framing_id": "framing-feature-01J6...",
    "origin": "new",
    "feature_id": null,
    "working_title": "Titre de travail"
  },
  "revision": 12,
  "previous_revision": 11,
  "content_locale": "fr",
  "intent": {
    "definition": [],
    "problem": [],
    "desired_effects": [],
    "non_negotiable_rules": [],
    "exact_objective": [],
    "capabilities": [],
    "included": [],
    "excluded": [],
    "behaviors": []
  },
  "decisions": [],
  "evidence": {
    "repository_probe": null,
    "snapshot": null,
    "claims": []
  },
  "solution": {
    "context": [],
    "reuse": [],
    "design": [],
    "risks": [],
    "end_to_end_proof": null,
    "technical_contract_ref": null
  },
  "decomposition": null,
  "stabilizations": {
    "intent": null,
    "grounded_plan": null
  },
  "derived_state": {
    "repository_nature": "implemented",
    "product_clarity": "emerging",
    "grounding": "pending",
    "plan_authority": "conversational",
    "next_action": {}
  },
  "created_at": "2026-08-26T00:00:00Z",
  "updated_at": "2026-08-26T00:12:00Z"
}
```

Les tableaux permettent l'identification et la provenance élément par élément. Un texte monolithique serait difficile à corriger localement et pousserait le modèle à réécrire des décisions non concernées.

## Élément de connaissance

Les matières de `intent`, `decisions`, `claims`, `solution` et `decomposition` partagent une enveloppe minimale :

```json
{
  "id": "rule-resume-001",
  "statement": "Une autre session reprend sans demander le contexte déjà établi.",
  "provenance": {
    "kind": "human_decision",
    "reference": "framing-event-0042"
  },
  "status": "active",
  "introduced_in_revision": 4,
  "superseded_in_revision": null,
  "superseded_by": null
}
```

`provenance.kind` accepte :

- `human_decision` ;
- `agent_deduction` ;
- `source_fact` ;
- `inventory_fact` ;
- `technical_design` ;
- `recommendation` ;
- `open`.

Le contrôleur impose les champs complémentaires selon la provenance :

- `source_fact` exige snapshot, chemin et lignes ;
- `inventory_fact` exige snapshot, scope et empreinte d'inventaire ;
- `human_decision` exige l'événement de conversation qui l'a figé ;
- `technical_design` ne peut jamais être rendu comme « existant » ;
- `open` doit indiquer la capacité qu'il limite.

## Sonde de dépôt

La sonde est un contrat distinct de l'audit : rapide, locale, déterministe et sans provider.

```json
{
  "schema_version": 1,
  "project_id": "project-id",
  "scope_paths": ["."],
  "nature": "empty",
  "snapshot": {
    "git_commit": null,
    "workspace_fingerprint": "sha256:..."
  },
  "inventory": {
    "files": 0,
    "source_files": 0,
    "test_files": 0,
    "manifest_files": 0,
    "constraint_files": 0,
    "truncated": false,
    "ignored_roots": []
  },
  "reasons": [
    {
      "code": "no_auditable_material",
      "evidence_ref": "inventory:sha256:..."
    }
  ]
}
```

### Classification recommandée

- `empty` : aucun fichier métier, source, manifeste ou contrainte exploitable ;
- `skeleton` : contraintes, manifestes ou structure présents, sans implémentation significative ;
- `implemented` : matière source ou système exécutable réellement observable ;
- `indeterminate` : inventaire tronqué, erreur d'accès, sous-module non résolu ou état impossible à qualifier.

La classification doit utiliser des règles versionnées et retourner ses raisons. Un README seul ne transforme pas un dossier vide en produit implémenté. Un cache, un build ou des métadonnées Norn ne constituent jamais une matière à auditer.

## Décomposition discriminée

### Plan de Project

```json
{
  "kind": "project_features",
  "features": [
    {
      "candidate_id": "feature-resume",
      "title": "Reprendre un cadrage depuis n'importe quelle session",
      "observable_outcome": "L'utilisateur poursuit sans réexpliquer son projet.",
      "acceptance_scenario": "...",
      "included": [],
      "excluded": [],
      "depends_on": [],
      "cohesion_rationale": "Résultat livrable et vérifiable indépendamment."
    }
  ]
}
```

Une entrée est une Feature candidate, pas encore un dossier, une branche ou un pipeline. L'initialisation effective crée la Feature sélectionnée à partir de cette matière et relance le même moteur avec `target.kind = feature`.

### Plan de Feature

```json
{
  "kind": "feature_lots",
  "lots": [
    {
      "id": "lot-resume-state",
      "title": "Persistance et restitution du front courant",
      "objective": "...",
      "observable_effect": "...",
      "read_scopes": [],
      "write_scopes": [],
      "depends_on": [],
      "acceptance_proofs": {
        "functional": [],
        "ux": [],
        "code": [],
        "security": []
      }
    }
  ]
}
```

Un Lot devient l'unité transmise au planificateur d'exécution. Les `TaskPlan` techniques sont calculés sous le Lot ; ils ne sont pas persistés comme un niveau produit concurrent.

## État et autorité calculés

Le modèle ne peut pas écrire `derived_state`. Le contrôleur le recalcule.

| Autorité | Condition | Ce qu'elle autorise |
|---|---|---|
| `conversational` | matière Product en construction | poursuite du dialogue et révision locale |
| `intent_stabilized` | première stabilisation liée à l'empreinte de révision | sonde et confrontation technique |
| `grounded` | confrontation terminée ou conception greenfield explicitement qualifiée | préparation de la décomposition et des preuves |
| `consumable` | seconde stabilisation, aucun ouvert bloquant, décomposition valide | publication et consommation aval |
| `degraded` | preuve devenue invalide ou dépendance inaccessible | uniquement les suites indépendantes de l'écart |

Les deux stabilisations portent sur une empreinte. Une modification de la matière couverte invalide seulement la stabilisation dépendante. Une correction orthographique ou un changement de rendu ne la révoque pas.

## Delta proposé par l'Agent

L'Agent ne réécrit jamais le document complet. Il propose un delta sur une révision lue :

```json
{
  "schema_version": 1,
  "plan_id": "framing-plan-01J6...",
  "base_revision": 12,
  "operations": [
    {
      "op": "upsert_knowledge",
      "section": "intent.non_negotiable_rules",
      "value": {
        "id": "rule-resume-001",
        "statement": "...",
        "provenance": {
          "kind": "agent_deduction",
          "reference": "framing-event-0046"
        }
      }
    }
  ],
  "reason": "La reprise indépendante de la session a été rendue explicite."
}
```

Opérations minimales :

- `upsert_knowledge` ;
- `supersede_knowledge` ;
- `record_decision` ;
- `record_probe` ;
- `record_evidence` ;
- `invalidate_evidence` ;
- `propose_decomposition`.

`set_state`, `confirm`, `publish` et `delete_history` sont interdits aux deltas de modèle. Ils appartiennent au contrôleur ou à une action humaine authentifiée.

## Persistance et reprise

### Recommandation

Pendant la conversation, le journal et les révisions atomiques vivent sous :

```text
$ARKA_NORN_HOME/framing/<project>/<target>/
├── current.json
├── revisions/<revision>-<sha256>.json
└── events/<sequence>-<sha256>.json
```

Cela évite de salir le dépôt à chaque tour et rend la reprise indépendante du provider. Après la seconde stabilisation, Norn publie dans le dépôt une révision signée consommable, ou une référence portable accompagnée de son contenu si le Project choisit un stockage documentaire externe.

La publication est le seul doublon autorisé : son consommateur est le pipeline et sa fonction est la portabilité. Elle référence l'identifiant et l'empreinte exacts de la révision source ; elle n'est jamais réécrite silencieusement.

### Concurrence

Chaque écriture utilise `base_revision`. En cas de concurrence :

1. le contrôleur refuse l'écrasement ;
2. recharge la révision courante ;
3. réapplique automatiquement les opérations disjointes ;
4. transforme les opérations contradictoires en un unique point de confrontation ;
5. conserve les deux propositions dans le journal.

Une réponse Agent ne peut dire « enregistré » qu'après confirmation du store.

## Contrat de conduite pour la skill

La skill principale ne doit plus exiger `feature` ou `session_id` comme conditions d'entrée. Son entrée normale est le dossier courant et le contexte humain disponible.

Le contrôleur renvoie une action avec un niveau d'attention :

```json
{
  "kind": "continue_conversation",
  "attention": "agent",
  "target": {},
  "plan_revision": 12,
  "human_summary": "...",
  "agent_instruction": "..."
}
```

`attention` accepte :

- `agent` : continuer sans interrompre l'utilisateur ;
- `human_substance` : une seule substance ne peut être inventée ;
- `human_stabilization` : l'un des deux moments prévus ;
- `worker` : confrontation technique bornée ;
- `complete` : plan publié et suite explicitée ;
- `recoverable_failure` : état conservé, reprise indiquée.

La skill boucle tant que `attention = agent`. Elle ne s'arrête plus après chaque document. Elle restitue les opérations utiles, pas l'enum ou la structure interne.

## Surface CLI proposée

La surface publique reste courte. Elle est destinée aux Agents et intégrations ; l'utilisateur non technique reste dans la conversation.

```text
arka-norn framing enter [path] --json
arka-norn framing show [target] --view summary|plan|evidence|map --json
arka-norn framing resume [target] --json
```

Les mutations utilisent une surface privée de broker, sur le même principe qu'un worker d'orchestration : proposer un delta, enregistrer l'une des deux stabilisations et publier. Elles ne figurent ni dans l'aide destinée à l'utilisateur ni dans le parcours Web. Chaque réponse du broker contient déjà l'état et l'action suivante ; une commande publique `next` séparée n'est pas nécessaire.

`enter` :

- retrouve le Project par son chemin canonique ;
- initialise un Project minimal si nécessaire ;
- exécute ou recharge la sonde ;
- retrouve un cadrage actif ;
- calcule la restitution et l'action suivante.

La cible peut rester omise lorsque le contexte est non ambigu. Si plusieurs cadrages sont actifs, Norn présente leurs objectifs en langage humain au lieu d'exiger un identifiant opaque.

## Intégration proposée dans Norn Web

Norn Web ne doit pas devenir un second chat concurrent de l'Agent. Il fournit la continuité, la visibilité et les actions de reprise autour de la conversation menée dans Codex, Claude ou un autre profil.

### Ne pas ajouter une dixième entrée au rail

Le cadrage appartient au Project ou à la Feature ; il ne devient pas une nouvelle rubrique globale à côté de Documents, Audits ou Agents. Les routes recommandées sont contextuelles :

```text
/projects/<project>/framing/<framing-id>
/projects/<project>/features/<feature>/framing
```

La première route couvre le cadrage du Project et les nouvelles Features non encore matérialisées. Après matérialisation, la seconde devient la route canonique et l'ancienne redirige vers elle.

### Project Overview

Avant les métriques documentaires, afficher au plus une carte de conduite prioritaire :

```text
Cadrage en cours
Remettre la documentation au carré

Établi        Le résultat et les limites produit
En cours      Confrontation au code existant
Suite         Stabiliser le plan et ses Lots

[Reprendre le cadrage]          [Voir le plan]
```

S'il existe plusieurs cadrages, la carte montre le plus récemment actif et un lien vers les autres. Un cadrage qui attend réellement l'utilisateur prend la priorité sur une anomalie documentaire de pipeline ; un worker simplement en cours ne détourne pas le focus.

### Liste des Features

L'action principale devient « Cadrer une nouvelle Feature ». Elle crée un `FramingPlan` avec un titre de travail, pas une Feature gérée. L'identifiant, le dossier et le workflow restent dans les détails de matérialisation proposés après la seconde stabilisation.

La liste rassemble sans les confondre :

- Features matérialisées ;
- cadrages de nouvelles Features en cours ;
- Features candidates issues du plan de Project.

Leur aspect peut être commun, mais leur statut humain doit être explicite : « à cadrer », « cadrage en cours », « prête à créer », « en livraison » ou « livrée ». Aucun enum brut n'est affiché.

### Fiche Feature

Lorsque la Feature possède un cadrage, la fiche commence par son résultat et son état de conduite. Le rail de pipeline devient une section de livraison, pas l'identité principale de la Feature.

Ordre recommandé :

1. résultat attendu et action de reprise ;
2. plan, preuves et Lots ;
3. livraison en cours ;
4. documents et anomalies techniques.

### Action « Reprendre le cadrage »

Cette action ne dépend jamais de la disponibilité de l'ancienne session Product. Le backend produit un `FramingResumePacket` borné : cible, révision, restitution humaine, action suivante et empreinte.

Le comportement recommandé est :

1. reprendre avec le profil actif s'il est toujours disponible et autorisé ;
2. sinon présenter les profils configurés sans en choisir un silencieusement ;
3. toujours offrir un paquet de reprise copiable comme sortie de secours ;
4. ouvrir le nouveau contexte directement sur le front courant, jamais sur le début du cadrage.

L'ancienne session peut rester un raccourci de confort, jamais une précondition.

### Continuer avec un Agent connecté ou un service Web

Norn distingue deux transports sans changer le plan :

- **Agent connecté** : Codex CLI, Claude CLI ou autre profil capable d'appeler la skill. Le paquet contient seulement la référence, la révision, l'action et l'empreinte ; l'Agent relit le plan par Norn.
- **Service Web déconnecté** : ChatGPT ou Claude.ai sans accès local. Norn génère un export éphémère contenant uniquement la vue nécessaire du plan, les règles de conduite et le contrat du delta attendu. Le résultat revient par import et passe le même validateur que toute proposition Agent.

L'export Web n'est ni un nouveau document produit, ni la source de reprise. C'est un message de transport borné, expurgé et lié à une révision. Il expire lorsque la révision change et ne contient aucun chemin sensible non nécessaire.

L'UX recommandée présente une action principale selon le profil actif — par exemple « Reprendre avec Codex » — puis « Changer de profil » et « Copier le paquet de reprise ». Norn ne promet jamais qu'un onglet externe a conservé sa session et ne marque aucun travail comme reçu avant import validé.

### Remplacement de l'onboarding actuel

Le profil humain devient un réglage léger à la première décision signée, pas la première porte avant de voir le produit. L'entrée principale suit :

```text
dossier → Project minimal/repris → sonde → première reformulation utile
```

Sur un dossier vide, l'utilisateur arrive dans le cadrage du Project. Sur un Project connu, il arrive sur sa vue d'ensemble avec son cadrage actif. La création obligatoire d'une première Feature, le choix préalable du pipeline et le résumé final du wizard disparaissent.

La persistance de route actuelle peut être réutilisée pour le confort de navigation, mais la reprise fonctionnelle doit venir du `FramingPlan`, pas de `WebOnboardingProgress`.

## Relation avec les pipelines existants

### Recommandation

Le cadrage n'est pas un nouveau pipeline ajouté devant les autres. Il remplace les responsabilités `concept`, `plan`, `feature_brief` et l'audit systématique de cadrage.

Une révision publiée expose des projections de compatibilité :

- `Feature Brief` pour un pipeline Essential existant ;
- `Plan` et, si nécessaire, `Technical Contract Appendix` pour un pipeline Complete importé ;
- aucune projection `Current State Audit` lorsque la sonde conclut `empty` ;
- une référence de preuves techniques lorsque la confrontation a réellement eu lieu.

À terme, les pipelines démarrent depuis `plan_ref` et ne redemandent pas le cadrage. Les schémas v5 restent lisibles pour import et historique ; ils ne pilotent plus la conversation.

### Traitement du cadrage déjà produit

Le `feature_brief` actuellement présent pour `feature-cadrage-engine` décrit un assistant de complétude limité au pipeline Essential (`features/feature-cadrage-engine/feature_brief.json:11`) et centre ses Lots sur la suggestion de critères puis le scaffold (`features/feature-cadrage-engine/feature_brief.json:31`). Il exclut explicitement les autres phases et pipelines (`features/feature-cadrage-engine/feature_brief.json:20`).

Cette proposition ne correspond plus au moteur défini ici. Elle doit être conservée comme historique supersédé, pas exécutée ni corrigée jusqu'à rejoindre artificiellement le nouveau concept. Son import futur peut nourrir les risques de boilerplate et les exigences de couverture, sans reprendre son architecture.

## Découpage d'implémentation recommandé

Il s'agit d'un plan de Project : chaque élément ci-dessous est une Feature cohérente, pas un Lot technique.

### Feature 1 — Entrer et reprendre un cadrage

**Résultat observable** — Depuis un dossier vide ou existant, l'Agent établit le Project et reprend le bon front de cadrage sans exiger Feature, pipeline ou ancienne session.

**Lots probables** — cible commune et store de révisions ; sonde déterministe ; commande `framing enter/resume` ; migration de la skill bootstrap.

### Feature 2 — Construire le plan vivant par conversation

**Résultat observable** — Chaque échange utile enrichit un plan humainement lisible, corrigeable localement et protégé contre les écritures concurrentes.

**Lots probables** — contrat de connaissances ; delta et validation ; états dérivés ; première stabilisation ; rendu humain.

### Feature 3 — Confronter l'intention au réel

**Résultat observable** — Norn adapte la preuve à la nature du dépôt et produit un plan fondé sans audit vide ni affirmation technique inventée.

**Lots probables** — politique par nature de dépôt ; worker de lecture aveugle ; preuves code/inventaire ; conception greenfield ; seconde stabilisation.

### Feature 4 — Décomposer et publier un plan consommable

**Résultat observable** — Un Project produit des Features cohérentes et une Feature produit des Lots bornés, puis le pipeline consomme la révision publiée sans refaire le cadrage.

**Lots probables** — test de cohésion ; unions de décomposition ; publication signée ; projections de compatibilité ; pont vers l'orchestration.

### Feature 5 — Conduire le cadrage dans Norn Web

**Résultat observable** — L'utilisateur voit l'objectif, le dernier fait établi, le travail en cours et la suite, puis reprend ou corrige sans manipuler le JSON ni rechercher une session.

**Lots probables** — bandeau de conduite ; vue Plan ; vue Preuves ; carte Project/Feature/Lot ; historique et reprise accessible.

## Ordre recommandé

```text
Feature 1
   ↓
Feature 2
   ↓
Feature 3
   ↓
Feature 4

Feature 2 ──→ Feature 5
Feature 3 ──→ Feature 5
Feature 4 ──→ Feature 5
```

La surface Web peut commencer après le premier rendu humain de Feature 2, puis s'enrichir sans bloquer le moteur. Le pont vers l'orchestration attend en revanche que la provenance, l'autorité et la décomposition soient stables.

## Première démonstration de vérité

Avant de migrer tous les pipelines, Norn doit réussir deux parcours complets avec le vrai store de révisions et la vraie skill.

### Parcours A — Project vide

1. L'utilisateur invoque Norn dans un dossier vide.
2. Norn initialise le Project minimal, classe le dossier `empty` et ne lance aucun audit.
3. L'Agent ouvre par une compréhension utile et maintient le plan en arrière-plan.
4. La première stabilisation autorise une conception technique greenfield explicitement qualifiée.
5. La session est interrompue puis reprise avec un autre Agent depuis le plan seul.
6. La seconde stabilisation publie une carte de Features candidates sans les créer automatiquement.

### Parcours B — Feature sur dépôt implémenté

1. L'utilisateur exprime un résultat sans fournir d'identifiant, de dossier ou de pipeline.
2. Norn crée une cible de cadrage Feature non matérialisée.
3. Après stabilisation de l'intention, le worker lit le code sans recevoir la solution attendue.
4. Les faits utiles reviennent avec snapshot et `fichier:ligne`.
5. L'Agent confronte, corrige localement le plan et propose des Lots cohérents.
6. La seconde stabilisation matérialise la Feature seulement après confirmation de ses détails dérivés.

### Preuves obligatoires

- zéro commande d'audit sur le parcours A ;
- exactement deux événements de stabilisation humaine dans chaque parcours ;
- reprise réussie sans ancienne session et sans répétition du contexte ;
- aucune affirmation technique sans provenance compatible ;
- aucune Feature ni pipeline créés prématurément ;
- état reconstruit depuis journal et révisions après arrêt brutal ;
- vue Web entièrement humaine, sans JSON brut ni enum principal ;
- correction d'une décision sans perte des éléments indépendants ;
- import d'un delta d'Agent déconnecté soumis aux mêmes validations ;
- carte Project → Features et Feature → Lots distinctes mécaniquement.

Cette démonstration est le seuil avant migration du pipeline Complete ou branchement à l'orchestration automatique.

## Décisions recommandées à conserver ouvertes pendant la réflexion

1. **Stockage publié** — recommander une révision signée dans le dépôt, avec journal de travail sous `$ARKA_NORN_HOME`.
2. **Namespace CLI** — recommander `framing`, plus explicite et moins ambigu que `plan`.
3. **Compatibilité v5** — recommander lecture/import et projections de sortie, sans continuer à piloter le nouveau cadrage par les anciens fichiers.
4. **Création des Features candidates** — recommander une matérialisation à la demande, jamais automatique à la seconde stabilisation.
5. **Choix de pipeline** — recommander une proposition calculée après publication, sans question préalable à l'utilisateur et sans fallback silencieux.
6. **Audit détaillé** — recommander une capacité appelée par besoin et risque, jamais une étape universelle du cadrage.

Ces décisions ne nécessitent pas six confirmations. Elles restent des recommandations visibles jusqu'à ce qu'une contradiction, une contrainte du code ou l'une des deux stabilisations oblige à les figer.
