# CR Dev — ARKANORN / postinstall_welcome_and_menu_sections

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-postinstall_menu-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Statut | LIVRÉ |

---

## Objet

1. Après `npm install -g arka-norn`, rien ne guidait l'utilisateur. Ajout d'un message postinstall à la charte Arka Labs avec les prochaines actions.
2. Le menu d'accueil TUI mélangeait à plat projets et actions système. Regroupement en sections Projects / Maintenance / Preferences.

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `scripts/postinstall.mjs` | Créé | Message postinstall à la charte, défensif (jamais bloquant, silencieux en CI/dev) |
| `package.json` | Modifié | Hook `postinstall` |
| `src/adapters/inbound/tui/components/menu.ts` | Modifié | En-têtes de section non sélectionnables, navigation qui les saute |
| `src/adapters/inbound/tui/views/home-view.ts` | Modifié | Menu groupé Projects / Maintenance / Preferences |
| `src/application/localization/messages/en|fr/tui.ts` | Modifiés | Clés `tui.home.section.*` EN/FR |
| `tests/unit/menu-sections.test.ts` | Créé | 3 tests : curseur initial, saut d'en-tête, rendu section |

---

## Comportement

- **Postinstall** : bannière ARKA + « Get started » (setup, web start, framing enter ., guide). Ignoré en CI, en mode silencieux npm, ou dans l'arbre de dev du framework. N'échoue jamais l'installation ; fallback texte si le rendu à la charte n'est pas disponible.
- **Menu TUI** : trois sections avec en-têtes en capitales grisées. Le curseur démarre sur la première action, Haut/Bas sautent les en-têtes, un en-tête ne peut jamais être sélectionné ni recevoir le curseur.

---

## Vérifications

| Check | Résultat |
|---|---|
| Typecheck | PASS |
| Build complet | PASS |
| Lint ciblé | PASS |
| `check:max-lines` / `check:language` / `check:links` | PASS |
| Tests menu (unité) | 3/3 |
| Tests TUI e2e | 14/14 |
| Suite complète | 365/0 |
| Environnement CI simulé (PATH sans hôte) | 11/11 |
| Release adoption gate | 20/20 |

---

## Décisions techniques

| Décision | Raison |
|---|---|
| Postinstall défensif, jamais throw | Un message d'accueil ne doit jamais casser une install |
| Skip en CI et dans l'arbre de dev | Éviter le bruit sur les builds et le développement local |
| En-têtes portés par le composant menu | Réutilisable au-delà du home, navigation cohérente |
| Curseur initialisé sur la première entrée sélectionnable | Ne jamais démarrer sur un en-tête |

