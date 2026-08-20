# Handoff — ARKANORN / audit-recovery v1.2.0

## État de livraison

Le lot de reprise F01–F10 est implémenté et validé. La branche de livraison est
`codex/audit-recovery-v1.2.0`, basée sur
`eca803e60156349e0967b7773c8b5225f202e95f`.

## À retenir

- Une Feature gérée ne peut plus fournir de verdict Pipeline sans registre
  d'auteurs valide ; les erreurs de contrôle retournent le code `3`.
- Les huit skills core sont désormais une condition bloquante de `doctor`.
- L'audit d'un Project sans Feature utilise `audit_etat_reel` v4 avec
  `project_id`; le v2/v3 Feature reste valide.
- Le selftest est utilisable depuis un checkout lancé directement, sans
  `npm_execpath`.
- Les index et markers ne redéfinissent plus les frontières : identité,
  confinement et absence de symlink sont vérifiés depuis le marker réel.
- Le journal d'audit bloque les symlinks, fichiers spéciaux et hardlinks avant
  toute écriture ; un scaffold ne démarre pas sans intention journalisée.

## Preuves à consulter

1. Audit source : `input/audit/AUDIT-COMPLET-ARKA-NORN-20260820.md`.
2. Audit Project v4 : `input/audit/AUDIT-ETAT-REEL-ARKA-NORN-20260820-01.json`.
3. Développement : `input/reports/CR-DEV-ARKANORN-audit-recovery-v1.2.0-20260820-01.md`.
4. Recette : `input/reports/REC-ARKANORN-audit-recovery-v1.2.0-20260820-01.md`.
5. Décision de contrat : `docs/adr/ADR-006-audit-project-v4.md`.

## Vérifications exécutées

- `npm run release:verify` : PASS ;
- `node bin/arka-norn.mjs skills doctor --target . --profile all --json` :
  18/18 skills saines ;
- `doctor --json` avec un home isolé : 8/8 skills core, 0 divergence, 0 fail ;
- audit Project v4 validé par la CLI.
- `gitnexus check --repo arka-norn --cycles` : aucun import circulaire.

## Suite conseillée

Après le push, faire exécuter la matrice CI distante et ouvrir la revue de la
branche. Aucun changement de données Project ou de registre utilisateur n'est
attendu : les sauvegardes de skills locales restent sous `.arka-norn/backups/`.
