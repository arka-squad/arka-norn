# CR Dev — ARKANORN / E1_orchestration_preview

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-E1-orchestration_preview-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md`, Lot E1 |
| Statut | LIVRÉ (E2E Web différé en fin de lots sur instruction utilisateur) |

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `src/application/web/contracts.ts` | Modifié | Vues `OrchestrationPreview*` humaines et méthode bridge |
| `src/application/web/project-tracking-service.ts` | Modifié | Projection preview via le runtime 2.3, sans persistance côté Web |
| `src/composition/web-runtime.ts` | Modifié | Câblage du runtime d'orchestration 2.3 dans le service Web |
| `src/adapters/inbound/web/api-router.ts` | Modifié | Route `POST /features/:id/orchestration-preview`, extraction `dispatchFeaturePost` |
| `src/application/capabilities/capability-registry.ts` | Modifié | `orchestration.preview` exposée aussi sur `web` |
| `web/src/bridge/http-bridge.ts` | Modifié | Appel bridge `previewOrchestration` |
| `web/src/views/orchestration-preview-panel.tsx` | Créé | Panneau humain DAG, profils, coûts, préflights, causes |
| `web/src/views/feature-view.tsx` | Modifié | Affiche le panneau quand le mode est automatique |
| `web/src/styles/views.css` | Modifié | Styles du panneau d'aperçu |
| `src/application/localization/messages/en|fr/web.ts` | Modifiés | Clés `web.preview.*` EN/FR |
| `tests/integration/web-orchestration-preview.test.ts` | Créé | Preview projeté, DAG, profils, préflights, aucune campagne démarrée |

---

## Exigences couvertes

| ID | Exigence | Couvert | Preuve |
|---|---|---|---|
| E1-01 | Projeter DAG, rôles, profils, scopes, budgets, risques et préflights | OUI | `OrchestrationPreviewView` + panneau UI |
| E1-02 | Localiser les causes structurées sans masquer les codes utiles | OUI | `issues` et `preflights` avec code + message expurgé |
| E1-03 | Ne persister aucune campagne au preview | OUI | Le service délègue en lecture ; aucun run démarré (test) |
| E1-04 | Aucune vue JSON brute | OUI | Rendu humanisé, libellés EN/FR, codes formatés |

---

## Vérifications

| Check | Résultat |
|---|---|
| Typecheck | PASS |
| Build complet (tsc + web) | PASS |
| Lint ciblé | PASS (complexité `dispatchPost` ramenée sous le seuil) |
| Taille fichiers | PASS — maximum 700 lignes |
| Langue publique | PASS |
| Tests intégration + unités ciblés | 12/12 passed |
| Tests Web | 23/23 passed |
| E2E Web | DIFFÉRÉ — lancé en fin de lots sur instruction utilisateur |

---

## Décisions techniques

| Décision | Raison |
|---|---|
| Le Web réutilise le runtime 2.3 exact du CLI | Empreintes et préflights identiques entre surfaces |
| Preview exposé en POST | Le runtime peut matérialiser le plan par empreinte, comme le doctor-preview |
| Le panneau n'apparaît qu'en mode automatique | Ne pas suggérer un lancement assisté hors périmètre |
| Choix profil/provider/modèle repoussé à l'autorisation | E1 informe, E2 autorise |
| `dispatchFeaturePost` extrait | Garder la complexité du routeur sous le plafond lint |

---

## Handoff

→ Prêt pour E2 — Feuille d'autorisation (empreinte, profils par rôle, budget, parallélisme)

