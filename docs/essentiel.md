# Features Essentiel

Essentiel est le workflow par défaut pour livrer une Feature : un cadrage fusionné (intention, lots, critères prouvables), une annexe technique optionnelle, la livraison, un audit bloquant et une validation qui ne peut viser que le dernier CR. Il comble l'écart entre le pipeline standard (dix étapes, pour l'incertain et l'architecture) et FastDev (quatre étapes, réservé aux reworks bornés).

Pour concevoir son interface web, voir le [brief UX/UI destiné au graphiste](design/brief-interface-web-essentiel.md).

```text
cadrage_essentiel → [annexe_contrat_technique] → cr_dev → audit_livraison → [cr_dev correctif] → validation_livraison
```

Quatre documents obligatoires signés, environ 5 à 7 Ko : le cadrage fusionne ce que le standard répartit entre concept, plan et tâches ; l'annexe n'existe que si de vrais contrats externes le justifient ; chaque constat `corriger` doit être fermé par `corrections_apportees` ; une validation ancienne devient obsolète dès qu'un nouveau CR est livré.

## Démarrer

```bash
arka-norn workflow show essentiel
arka-norn essentiel start "Filtrer les Features par état" --project product
arka-norn essentiel next <feature> --session <session-id> --json
```

Une Feature créée sans `--workflow` utilise Essentiel :

```bash
arka-norn feature create "Nom" --project <project-id>          # → arka-norn-essentiel
arka-norn feature create "Nom" --project <project-id> --workflow standard
arka-norn feature set-workflow <feature> --workflow essentiel
```

Le choix devient immuable au premier document reconnu.

## Quand choisir Essentiel, et quand escalader

Essentiel convient quand le besoin est clair, le périmètre borné et la valeur identifiable : une fonctionnalité, une amélioration produit, un chantier de deux à quatre lots. Si le cadrage révèle une incertitude forte, une architecture nouvelle ou une migration critique, escaladez vers le pipeline standard avant tout développement : recréez la Feature en standard, ou utilisez `set-workflow` si aucun document n'existe encore.

| Signal au cadrage | Workflow recommandé |
|---|---|
| Périmètre connu, 1 à 4 lots, valeur énonçable | **essentiel** |
| Incertain, architectural, migration de données | standard |
| Correctif ou refactor minuscule déjà borné | fastdev |

## Boucle contrôlée

- `audit_livraison: pass` ouvre directement la validation ;
- `corrections_requises` exige un CR livré qui dépend de l'audit et ferme chaque constat `corriger` via `corrections_apportees` ; une correction partielle est refusée ;
- une validation ne peut viser que le dernier CR ; toute validation plus ancienne devient obsolète après un nouveau développement ;
- seul `validation_livraison: pass` ciblant le dernier CR termine le workflow ; `partial` ne termine jamais.

La commande `essentiel next` donne phase, itération, prérequis, raison, instructions, livrable et commande exacte. Elle propage `--session` jusque dans le scaffold afin que `author_agent_id` soit celui du rôle spécialisé, pas celui du Product `main`. La skill `$arka-essentiel` exécute une seule de ces actions puis valide le document produit.

## Réutilisation, pas duplication

Les schémas d'audit et de validation sont partagés entre FastDev et Essentiel (`audit-livraison.schema.json`, `validation-livraison.schema.json`) : le champ `type` accepte les deux valeurs, et la liaison passe par les dépendances de documents. Le moteur guidé (`fastdev`, `essentiel`) est unique et configuré par pipeline. Voir [l'exemple complet](../examples/feature-essentiel/).
