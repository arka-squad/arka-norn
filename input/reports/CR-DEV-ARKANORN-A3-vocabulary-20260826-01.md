# CR Dev — ARKANORN / A3-vocabulary

| Champ           | Valeur                                    |
|----------------|-------------------------------------------|
| Ref             | CR-DEV-ARKANORN-A3-vocabulary-20260826-01 |
| Date            | 2026-08-26                                |
| Agent           | Claude (methode-dev)                      |
| Spec source     | `.input/spec-norn-2.3-convergence-produit.md` Lot A3 |
| Statut          | ✅ LIVRÉ                                  |

---

## Fichiers livrés

| Fichier                                                | Action   | Lignes | Rôle                                      |
|--------------------------------------------------------|----------|--------|-------------------------------------------|
| `src/application/localization/messages/en/web.ts`      | Modifié  | ~10    | Labels Web EN corrigés                    |
| `src/application/localization/messages/fr/web.ts`      | Modifié  | ~10    | Labels Web FR corrigés                    |
| `src/application/localization/messages/en/tui.ts`      | Modifié  | 1      | Label TUI EN corrigé                      |
| `src/application/localization/messages/fr/tui.ts`      | Modifié  | 1      | Label TUI FR corrigé                      |
| `src/application/localization/messages/en/tui-views.ts`| Modifié  | 2      | Labels TUI views EN corrigés              |
| `src/application/localization/messages/fr/tui-views.ts`| Modifié  | 2      | Labels TUI views FR corrigés              |
| `src/application/localization/messages/en/tui-actions.ts`| Modifié| 2      | Labels TUI actions EN corrigés            |
| `src/application/localization/messages/fr/tui-actions.ts`| Modifié| 2      | Labels TUI actions FR corrigés            |
| `docs/domain/trust-vocabulary.md`                      | Créé     | 22     | Glossaire public                          |
| `tests/unit/trust-vocabulary.test.ts`                  | Créé     | 58     | Test de non-régression des libellés       |

---

## Exigences couvertes

| ID   | Exigence                                                              | Couvert | Fichier:Ligne                              |
|------|-----------------------------------------------------------------------|---------|--------------------------------------------|
| A3.1 | Remplacer les libellés humains trompeurs sans casser les champs machine | ✅    | Messages Web/TUI EN/FR                     |
| A3.2 | Ajouter un glossaire court basé sur des mots utilisateur              | ✅      | `docs/domain/trust-vocabulary.md`          |
| A3.3 | Distinguer empreinte, attribution, validation et preuve               | ✅      | Glossaire                                  |
| A3.4 | Ajouter un test interdisant les libellés signed non justifiés         | ✅      | `tests/unit/trust-vocabulary.test.ts`      |

---

## Vérifications

| Check            | Résultat                                              |
|-----------------|-------------------------------------------------------|
| Build            | 0 erreur (`npm run build`)                            |
| Typecheck        | 0 erreur (`npm run typecheck`)                        |
| Lint             | 0 erreur, 0 warning (`npm run lint`)                  |
| Tests unitaires  | 151/151 passed                                        |
| Régressions      | 0                                                     |
| Grep `: any`     | 0                                                     |
| Grep TODO/stub   | 0                                                     |
| Labels restants  | Aucun "signed"/"signé" injustifié dans les valeurs    |

---

## Décisions techniques

| Décision                                            | Raison                                           |
|----------------------------------------------------|--------------------------------------------------|
| Conserver les clés `web.document.signed*`          | Ce sont des identifiants machine, pas des libellés |
| `author_agent_id` affiché comme "Attributed to"    | Précision sémantique sans changer les champs     |

---

## Problèmes détectés hors scope

| Problème | Fichier | Sévérité |
|----------|---------|----------|
| Aucun    | —       | —        |

---

## Handoff

→ Feature A terminée
→ Lot suivant : **B1 — Catalogue de pipelines v3**
