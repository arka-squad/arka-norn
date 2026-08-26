# CR Dev — ARKANORN / A1-setup

| Champ           | Valeur                                    |
|----------------|-------------------------------------------|
| Ref             | CR-DEV-ARKANORN-A1-setup-20260826-01     |
| Date            | 2026-08-26                                |
| Agent           | Claude (methode-dev)                      |
| Spec source     | `.input/spec-norn-2.3-convergence-produit.md` Lot A1 |
| Statut          | ✅ LIVRÉ                                  |

---

## Fichiers livrés

| Fichier                                                | Action     | Lignes | Rôle                                      |
|--------------------------------------------------------|------------|--------|-------------------------------------------|
| `src/adapters/outbound/skills/host-detector.ts`        | Créé       | 81     | Détection de `codex`/`claude` dans PATH  |
| `src/adapters/inbound/cli/skills-cli.ts`               | Modifié    | ~230   | Commande `setup`, alias `install`, doctor |
| `src/adapters/inbound/cli/main-cli.ts`                 | Modifié    | +4     | Routage `setup` et alias `install`        |
| `src/application/localization/messages/en/cli-operations.ts` | Modifié | +10    | Libellés EN de setup                      |
| `src/application/localization/messages/fr/cli-operations.ts` | Modifié | +10    | Libellés FR de setup                      |
| `src/application/localization/messages/en/help.ts`     | Modifié    | +1     | Documentation CLI `setup`                 |
| `src/application/localization/messages/fr/help.ts`     | Modifié    | +1     | Documentation CLI `setup` FR              |
| `tests/unit/setup-command.test.ts`                     | Créé       | 168    | Tests unitaires setup                     |
| Fichiers `dist/` correspondants                        | Générés    | —      | Build de livraison                        |

---

## Exigences couvertes

| ID   | Exigence                                                              | Couvert | Fichier:Ligne                                          |
|------|-----------------------------------------------------------------------|---------|--------------------------------------------------------|
| A1.1 | Factoriser le comportement d’installation de skill                    | ✅      | `skills-cli.ts:setup` réutilise `installSkills`        |
| A1.2 | Ajouter la détection des hôtes supportés réellement présents          | ✅      | `host-detector.ts:detectHosts`                         |
| A1.3 | Afficher les cibles avant écriture                                    | ✅      | `skills-cli.ts:humanSetupPreview`                      |
| A1.4 | Installer/mettre à jour les skills de manière idempotente             | ✅      | `skill-installer.ts` (existant) + test idempotence     |
| A1.5 | Exécuter `skills doctor` après installation                           | ✅      | `skills-cli.ts:doctorChecks`                           |
| A1.6 | Retourner `0` si tout prêt, code distinct si aucun hôte               | ✅      | `skills-cli.ts:envelope(..., 2/3/0)`                   |
| A1.7 | Ne pas installer provider, credential, Docker ou profil               | ✅      | `setup` n’appelle que `installSkills`                  |
| A1.8 | Ne copier aucun secret                                                | ✅      | Aucune lecture de credential ajoutée                   |
| A1.9 | Accepter `--global`, `--project`, `--host codex\|claude\|all`, `--json`| ✅      | `skills-cli.ts:parseStrictArguments`                   |
| A1.10| Conserver `install` comme alias documenté                             | ✅      | `main-cli.ts:install` route vers `setup`               |

---

## Vérifications

| Check            | Résultat                                              |
|-----------------|-------------------------------------------------------|
| Build            | 0 erreur (`npm run build`)                            |
| Typecheck        | 0 erreur (`npm run typecheck`)                        |
| Lint             | 0 erreur, 0 warning (`npm run lint`)                  |
| Tests unitaires  | 150/150 passed (142 existants + 8 nouveaux)           |
| Régressions      | 0                                                     |
| Grep `: any`     | 0 sur les fichiers modifiés                           |
| Grep TODO/stub   | 0                                                     |
| CLI manuel       | `arka-norn setup --dry-run` détecte codex/claude      |

---

## Décisions techniques

| Décision                                            | Raison                                           |
|----------------------------------------------------|--------------------------------------------------|
| Code retour `2` si aucun hôte détecté              | Distinct des erreurs d’installation (5/70) et doctor (3) |
| Doctor cible `target` ou `globalHome` séparément   | Évite les faux positifs sur fichiers `.agents` vs globaux |
| Alias `install` avec warning de compatibilité      | Respecte D06 tout en préservant l’habitude 2.2   |

---

## Problèmes détectés hors scope

| Problème | Fichier | Sévérité |
|----------|---------|----------|
| Aucun    | —       | —        |

---

## Handoff

→ Prêt pour recette-qa indépendante (parcours T1 : installation tarball, setup, `/arka-norn`)
→ Lot suivant recommandé : **A2 — Quickstart et exigences progressives**
