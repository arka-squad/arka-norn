/**
 * FeatureDetailView -- écran d'une feature sélectionnée : statut pipeline,
 * scaffold, validation, retrait. Modelé sur project-detail-view.ts
 * (arka-cc-management), sans équivalent direct : "bundles" (agents/hooks/
 * teams installés) n'existe pas pour une feature -- remplacé par les 4
 * actions pipeline (status/scaffold/validate/forget), chacune déléguée à
 * un callback fourni par composition/container.ts (qui seul connaît `app`
 * et peut pousser TextInput/ResultView -- cf. home-view.ts).
 */
import { createMenuScene, filterItems } from "../components/menu.js";
import { GUIDED_SHORTCUTS, renderGuidance } from "../components/guidance.js";
import { createFeatureCockpitViewModel } from "../../../../application/view-models/feature-cockpit.js";
const ANGLE_RIGHT = String.fromCharCode(0x276f);
const LEFT_ARROW = String.fromCharCode(0x2190);
const EM_DASH = String.fromCharCode(0x2014);
const HORIZONTAL = String.fromCharCode(0x2500);
export function createFeatureDetailView(deps) {
    const cockpit = createFeatureCockpitViewModel(deps.feature, deps.report);
    const menu = buildMenu();
    let busy = false;
    let status;
    let helpVisible = false;
    function buildMenu() {
        return createMenuScene(buildMenuItems(), {
            title: deps.feature.name,
            hint: "↑/↓ naviguer · Entrée agir · / filtrer · ? aide · Échap retour",
            maxVisible: 12,
            onSelect: (value) => {
                void handleSelect(value);
            },
        });
    }
    async function handleSelect(value) {
        if (busy)
            return;
        switch (value) {
            case "action:status":
                if (deps.onShowStatus !== undefined) {
                    await run(() => deps.onShowStatus(deps.feature));
                    return;
                }
                status = "Action indisponible.";
                deps.redraw();
                return;
            case "action:scaffold":
                if (deps.onScaffold !== undefined) {
                    await run(() => deps.onScaffold(deps.feature));
                    return;
                }
                status = "Action indisponible.";
                deps.redraw();
                return;
            case "action:validate":
                if (deps.onValidate !== undefined) {
                    await run(() => deps.onValidate(deps.feature));
                    return;
                }
                status = "Action indisponible.";
                deps.redraw();
                return;
            case "action:forget":
                if (deps.onForget !== undefined) {
                    await run(() => deps.onForget(deps.feature));
                    return;
                }
                status = "Action indisponible.";
                deps.redraw();
                return;
            case "action:back":
                deps.onBack();
                return;
        }
    }
    async function run(task) {
        busy = true;
        deps.redraw();
        try {
            await task();
        }
        finally {
            busy = false;
            deps.redraw();
        }
    }
    return {
        onKey(event) {
            if (busy)
                return "consumed";
            if (event.kind === "help") {
                helpVisible = !helpVisible;
                deps.redraw();
                return "consumed";
            }
            if (helpVisible) {
                if (event.kind === "escape")
                    helpVisible = false;
                deps.redraw();
                return "consumed";
            }
            const result = menu.onKey(event);
            if (event.kind === "enter")
                return "consumed";
            if (event.kind === "escape") {
                deps.onBack();
                return "consumed";
            }
            return result;
        },
        render(renderer, theme) {
            renderer.redraw((line) => {
                for (const rendered of renderFeatureDetail(theme)) {
                    line(rendered);
                }
            });
        },
    };
    function renderFeatureDetail(theme) {
        if (helpVisible) {
            return renderGuidance({
                title: "Aide — cockpit Feature",
                purpose: "Le Pipeline décide de la prochaine action à partir des documents réellement présents, de leur schéma, de leurs dépendances et du verdict métier.",
                steps: [
                    "Lisez l’action recommandée et sa raison ; ne sautez pas à une étape ultérieure.",
                    "Si l’action demande un document, vérifiez qu’un agent actif est affiché puis utilisez le scaffold.",
                    "Remplissez toutes les valeurs À_REMPLIR et validez le fichier.",
                    "Relancez le statut après chaque document ; une QA fail renvoie au développement.",
                ],
                shortcuts: GUIDED_SHORTCUTS,
            }, theme);
        }
        const lines = [
            `  ${theme.bold(deps.feature.name)}`,
            `  ${theme.gray(deps.feature.root)}`,
            `  État : ${theme.arkaAccent(cockpit.overallStatus)} · ${cockpit.progress}`,
            `  Agent auteur : ${deps.currentAgentId ?? "aucun — revenez au Project > Gérer les agents"}`,
            `  Prochaine action : ${cockpit.nextAction}`,
            `  Pourquoi : ${cockpit.nextReason}`,
            `  Runs : dev=${cockpit.developmentRuns} QA=${cockpit.qaRuns} échecs=${cockpit.qaFailures} · dettes=${cockpit.debtDocuments} · handoffs=${cockpit.handoffSignals}`,
            "",
            `  ${theme.bold("Timeline du pipeline")}`,
            ...cockpit.timeline.map((step) => `    ${step}`),
            "",
        ];
        if (busy) {
            lines.push(`  ${theme.dim("Chargement…")}`);
            lines.push("");
        }
        else if (status !== undefined) {
            lines.push(`  ${theme.arkaAccent(status)}`);
            lines.push("");
        }
        if (menu.filterMode) {
            lines.push(...renderFlatItems(resolveVisibleItems(buildMenuItems(), theme.stripAnsi), menu.cursor, theme, "index"));
        }
        else {
            lines.push(...renderFlatItems(buildMenuItems().map((item, index) => ({ ...item, _origIndex: index })), menu.cursor, theme, "origin"));
        }
        lines.push("");
        lines.push(`  ${theme.dim(HORIZONTAL.repeat(44))}`);
        lines.push(`  ${theme.dim("↑/↓ naviguer · Entrée agir · / filtrer · ? aide · Échap retour")}`);
        if (menu.filterMode) {
            lines.push(`  / ${menu.filterText}${theme.dim("_")}`);
        }
        return lines;
    }
    function renderFlatItems(items, cursor, theme, matchCursorOn) {
        if (items.length === 0) {
            return [`    ${theme.dim("(vide)")}`];
        }
        return items.map((item, index) => {
            const active = matchCursorOn === "index" ? index === cursor : item._origIndex === cursor;
            const marker = active ? theme.arkaRed(ANGLE_RIGHT) : " ";
            const label = active ? theme.bold(item.label) : item.label;
            const description = item.description === undefined ? "" : ` ${theme.gray(`${EM_DASH} ${item.description}`)}`;
            return `  ${marker} ${label}${description}`;
        });
    }
    function buildMenuItems() {
        return [
            { label: "Voir le diagnostic complet", value: "action:status", description: "présence, schéma, métier, dépendances et raison de blocage" },
            { label: "Générer le prochain document", value: "action:scaffold", description: deps.currentAgentId === undefined ? "bloqué : sélectionnez d’abord un agent dans le Project" : `document v3 signé par ${deps.currentAgentId}` },
            { label: "Valider un document rempli", value: "action:validate", description: "détecte champs manquants, sentinelles et contrat invalide" },
            { label: "Retirer de l'index", value: "action:forget", description: "conserve les fichiers et le marqueur sur disque" },
            { label: `${LEFT_ARROW} Retour`, value: "action:back" },
        ];
    }
    function resolveVisibleItems(items, stripAnsi) {
        return menu.filterMode ? filterItems(items, menu.filterText, stripAnsi) : items.map((item, index) => ({ ...item, _origIndex: index }));
    }
}
//# sourceMappingURL=feature-detail-view.js.map