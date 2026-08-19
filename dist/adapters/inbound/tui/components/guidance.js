import { titledBox } from "./box.js";
export function renderGuidance(content, theme) {
    const lines = [
        content.purpose,
        "",
        ...content.steps.map((step, index) => `${index + 1}. ${step}`),
        ...(content.shortcuts === undefined ? [] : ["", "Raccourcis", ...content.shortcuts.map((shortcut) => `• ${shortcut}`)]),
        "",
        "Appuyez sur ? pour fermer l’aide.",
    ];
    return titledBox(content.title, lines, theme, { border: theme.arkaRed }).split("\n");
}
export function nextActionLine(action, reason, theme) {
    return `  ${theme.bold("Action recommandée")} : ${theme.arkaAccent(action)} ${theme.gray(`— ${reason}`)}`;
}
export const GUIDED_SHORTCUTS = [
    "↑/↓ : déplacer la sélection",
    "Entrée : exécuter l’action sélectionnée",
    "/ : filtrer la liste",
    "Échap : revenir sans modifier",
    "? : afficher ou fermer cette aide",
];
//# sourceMappingURL=guidance.js.map