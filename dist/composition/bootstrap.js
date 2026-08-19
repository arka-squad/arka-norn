/**
 * bootstrap -- point d'entrée process de la TUI. Port TS très simplifié de
 * arka-cc-management (composition/bootstrap.ts) : pas de sous-commandes
 * non-interactives ici (governance/memory n'existent pas côté arka-norn ;
 * status/scaffold/validate/install/selftest restent gérées par
 * bin/arka-norn.mjs, qui route déjà `config`/absence d'argument vers ce
 * module -- cf. bin/arka-norn.mjs). Ce fichier ne fait donc que lancer la
 * TUI elle-même.
 */
import { createContainer } from "./container.js";
import { readEnv } from "./env.js";
export async function bootstrap() {
    const env = readEnv(process.env, process.cwd());
    const container = createContainer(env);
    container.setContextRoot(env.cwd);
    const homeView = await container.createHomeView();
    container.app.push(homeView);
    try {
        await container.app.run();
    }
    finally {
        container.setContextProject(undefined);
        container.setContextFeature(undefined);
    }
}
//# sourceMappingURL=bootstrap.js.map