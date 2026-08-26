# CR Dev — ARKANORN / D3_agent_management

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-D3-agent_management-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md`, Lot D3 |
| Statut | LIVRÉ |

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `src/application/web/agent-management-service.ts` | Créé | Commandes Web bornées, validation des scopes et conflits de révision |
| `src/adapters/outbound/filesystem/fs-agent-registry-store.ts` | Modifié | Registre révisionné et mutations atomiques |
| `src/adapters/inbound/web/api-router.ts` | Modifié | Routes strictes register/select/replace/deactivate |
| `src/application/web/contracts.ts` | Modifié | Projection Agent, sessions, filiation, dates et révision |
| `web/src/views/agents-view.tsx` | Modifié | Liste et dialogues de gestion des Agents |
| `tests/integration/web-agent-management.test.ts` | Créé | Invariants métier, concurrence, scopes, Product et historique |
| `tests/web/norn-web.spec.ts` | Modifié | Parcours E2E register puis replace |

---

## Exigences couvertes

| ID | Exigence | Couvert | Preuve |
|---|---|---|---|
| D3-01 | Enregistrer et sélectionner un Agent depuis le Web | OUI | Tests d'intégration et E2E |
| D3-02 | Remplacer un Agent sans réécrire son historique | OUI | Filiation `replacesAgentId` / `replacedByAgentId` |
| D3-03 | Désactiver avec confirmation si une session reste liée | OUI | Garde métier et dialogue de confirmation |
| D3-04 | Préserver les contraintes de la session Product principale | OUI | Tests de refus register/select/replace |
| D3-05 | Refuser les révisions concurrentes | OUI | Registre v2 et `agent_registry_changed` 409 |
| D3-06 | Borner les paths et Features au Project | OUI | Validation des Feature ids et refus `.git` / `.arka-norn` |
| D3-07 | Afficher sessions, scopes, historique, dates et productions | OUI | Projection `AgentTrackingView` et liste Web |

---

## Vérifications

| Check | Résultat |
|---|---|
| Build | PASS |
| Typecheck | PASS |
| Lint ciblé | PASS |
| Taille fichiers | PASS — maximum 700 lignes |
| Langue publique | PASS |
| Tests contrats/intégration ciblés | 11/11 passed |
| Tests Web | 22/22 passed |
| E2E Web | 3/3 passed |
| `git diff --check` | PASS |

L'E2E a détecté avant livraison une confusion entre l'identifiant Project lowercase et le format canonique `AgentId`. La route utilise désormais la validation du domaine et le parcours de remplacement passe.

---

## Décisions techniques

| Décision | Raison |
|---|---|
| Toute édition d'identité crée un remplacement | Conserver un historique immuable et attribuable |
| La révision du registre est vérifiée sous verrou fichier | Éviter une mutation perdue entre lecture Web et écriture |
| Le backend revalide les scopes indépendamment du formulaire | Ne pas faire confiance aux valeurs envoyées par le navigateur |
| Une désactivation liée exige la saisie de l'identifiant affiché | Rendre l'effet sur les sessions explicite |

---

## Handoff

→ Prêt pour recette QA ciblée D3
→ Prêt pour D4 — Doctor et réparations Web
