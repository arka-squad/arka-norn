import { activeLocale } from "./locale.js";
import { CLI_GUIDE_EN, CLI_HELP_EN } from "./messages/en/help.js";
import { CLI_GUIDE_FR, CLI_HELP_FR } from "./messages/fr/help.js";
export { CLI_GUIDE_EN, CLI_HELP_EN };
export function localizedCliHelp() {
    return activeLocale() === "fr" ? CLI_HELP_FR : CLI_HELP_EN;
}
export function localizedCliGuide() {
    return activeLocale() === "fr" ? CLI_GUIDE_FR : CLI_GUIDE_EN;
}
//# sourceMappingURL=cli-help.js.map