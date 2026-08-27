# CR Dev — ARKANORN / E2_orchestration_authorization

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-E2-orchestration_authorization-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md`, Lot E2 |
| Statut | LIVRÉ (E2E Web différé en fin de lots sur instruction utilisateur) |

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `src/application/web/contracts.ts` | Modifié | `OrchestrationAuthorizationInput`, `OrchestrationRunView`, méthode bridge |
| `src/application/web/project-tracking-service.ts` | Modifié | `authorizeOrchestration` délègue au helper |
| `src/application/web/orchestration-web-projection.ts` | Créé | Projections preview + authorize extraites (garde 700 lignes) |
| `src/adapters/inbound/web/api-router.ts` | Modifié | Route `POST /orchestration-authorize`, validation stricte de l'autorisation |
| `src/application/capabilities/capability-registry.ts` | Modifié | `orchestration.authorize` exposée sur `web` |
| `web/src/bridge/http-bridge.ts` | Modifié | Appel bridge `authorizeOrchestration` |
| `web/src/views/orchestration-preview-panel.tsx` | Modifié | Feuille d'autorisation : profils par rôle, commit, apply, budget, parallélisme, empreinte |
| `web/src/styles/views.css` | Modifié | Styles de la feuille d'autorisation |
| `src/application/localization/messages/en|fr/web.ts` | Modifiés | Clés `web.authorize.*` EN/FR |
| `tests/integration/web-orchestration-authorize.test.ts` | Créé | Autorisation par empreinte exacte, gate humain, refus d'empreinte divergente |
| `tests/unit/web-capability-registry.test.ts`, `web/src/generated/catalogs.test.ts` | Modifiés | Surface `web` de preview/authorize, `apply` reste hors Web |

---

## Exigences couvertes

| ID | Exigence | Couvert | Preuve |
|---|---|---|---|
| E2-01 | Créer une feuille d'autorisation utilisant l'empreinte réelle | OUI | `previewFingerprint` + `riskPolicyFingerprint` requis |
| E2-02 | Sélectionner profil/provider/modèle par rôle | OUI | `profileByRole` couvrant chaque rôle + intégrateur |
| E2-03 | Définir commit, application, budget et parallélisme | OUI | Champs `allowCommits`, `applyMode`, `budgetMode`, `maxParallel` |
| E2-04 | Refuser tout changement silencieux après empreinte | OUI | Le runtime refuse une empreinte divergente (test) |

---

## Vérifications

| Check | Résultat |
|---|---|
| Typecheck | PASS |
| Build complet (tsc + web) | PASS |
| Lint ciblé | PASS |
| Taille fichiers | PASS — service ramené sous 700 via extraction |
| Langue publique | PASS |
| Tests intégration + unités ciblés | 11/11 passed |
| Tests Web | 23/23 passed |
| E2E Web | DIFFÉRÉ — lancé en fin de lots sur instruction utilisateur |

---

## Décisions techniques

| Décision | Raison |
|---|---|
| L'autorisation appelle le `start` du runtime 2.3 exact | Mêmes empreintes et décisions que le CLI |
| Validation stricte de l'entrée côté serveur | Ne jamais faire confiance au formulaire navigateur |
| `apply` reste hors Web | E3 traitera l'application ; E2 se limite à autoriser |
| Projections preview/authorize extraites | Garder le service sous le plafond de 700 lignes |
| Feuille d'autorisation en Modal large | Rassembler rôles, budget et empreinte en une décision |

---

## Handoff

→ Prêt pour E3 — Suivi du DAG, gates humaines et application

