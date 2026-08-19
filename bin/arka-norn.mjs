#!/usr/bin/env node
// arka-norn — CLI unique du framework méthodologique agent-agnostique et multiprovider.
// Usage : arka-norn [commande] [args]
//
// Charte .input/legacy/spec/02-ui.md section 1 (arka-cc-management) — "TUI
// interactive sans subcommands. Une seule entrée. Tout passe par
// navigation." : `arka-norn` SEUL (sans sous-commande) lance directement la
// TUI, pas l'aide. Les sous-commandes (status/scaffold/validate/install/
// selftest) restent utilisables en script/CI ; `help`/`--help`/`-h` affiche
// l'aide explicitement.
import { runInstall } from "../scripts/install.mjs";
import { runStatus } from "../scripts/status.mjs";
import { runScaffold } from "../scripts/scaffold.mjs";
import { runValidate } from "../scripts/validate.mjs";
import { runSelftest } from "../scripts/selftest.mjs";
import { runDoctor } from "../scripts/doctor.mjs";
import { runManage } from "../scripts/manage.mjs";
import { runPipeline } from "../scripts/pipeline.mjs";
import { runSkills } from "../scripts/skills.mjs";
import { runMigrate } from "../scripts/migrate.mjs";

const HELP = `arka-norn — framework méthodologique JSON multiprovider (concept -> plan -> audit -> invariants -> dettes -> tâches -> spec -> CR-dev -> recette QA)

\`arka-norn\` seul (sans commande) lance la TUI interactive (nécessite un TTY).

Commandes :
  install [--global] [--target <repo>]   Déploie les skills arka-framework-* dans
                                          .claude/skills et .agents/skills du Project
                                          cible (défaut : dossier courant).
                                          --global les déploie aussi dans
                                          ~/.claude/skills (tous tes projets).
  status <dossier-feature>               Étapes valides/invalides/absentes + prochaine action.
  scaffold <step-id> <fichier-sortie>    Squelette JSON conforme au schema d'une étape.
  validate <fichier.json>                Valide un document contre son schema.
  selftest                               Vérifie arka-norn lui-même (gates + tests réels).
  doctor [--json] [--repair [--apply]]  Diagnostique les index ; réparation en dry-run par défaut.
  project <list|add|import|scan|show|use|forget|reconcile>
  feature <list|create|import|scan|show|use|forget|reconcile>
  pipeline <status|next|scaffold|validate>  Pilote le pipeline par Feature ou chemin.
  skills <list|install|doctor>             Catalogue, profils et santé des skills.
  migrate [--target <path>] [--dry-run|--apply]  Migre les markers avec backup.
  config                                 Alias explicite pour la TUI.
  help | --help | -h                     Affiche cette aide (au lieu de lancer la TUI).

Exemples :
  arka-norn
  arka-norn install --global
  arka-norn status examples/feature-notion-linear
  arka-norn scaffold concept ma-feature/concept.json
  arka-norn validate ma-feature/concept.json
`;

function launchTui() {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    console.error("arka-norn (TUI) nécessite un terminal interactif (TTY). Utilise une sous-commande CLI en mode script.");
    process.exitCode = 1;
    return;
  }
  import("../dist/composition/bootstrap.js")
    .then((m) => m.bootstrap())
    .catch((err) => {
      console.error(err instanceof Error ? err.stack : err);
      process.exitCode = 1;
    });
}

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case "install":
    await runInstall(rest);
    break;
  case "status":
    await runStatus(rest);
    break;
  case "scaffold":
    await runScaffold(rest);
    break;
  case "validate":
    await runValidate(rest);
    break;
  case "selftest":
    runSelftest();
    break;
  case "doctor":
    await runDoctor(rest);
    break;
  case "project":
  case "depot":
  case "feature":
    await runManage([cmd, ...rest]);
    break;
  case "pipeline":
    await runPipeline(rest);
    break;
  case "skills":
    await runSkills(rest);
    break;
  case "migrate":
    await runMigrate(rest);
    break;
  case "config":
  case undefined:
    launchTui();
    break;
  case "help":
  case "--help":
  case "-h":
    console.log(HELP);
    break;
  default:
    console.error(`Commande inconnue : "${cmd}"\n\n${HELP}`);
    process.exitCode = 64;
}
