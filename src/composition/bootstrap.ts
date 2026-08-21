/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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

export async function bootstrap(): Promise<void> {
  const env = readEnv(process.env, process.cwd());
  const container = createContainer(env);

  container.setContextRoot(env.cwd);

  const homeView = await container.createHomeView();
  container.app.push(homeView);

  try {
    await container.app.run();
  } finally {
    container.setContextProject(undefined);
    container.setContextFeature(undefined);
  }
}
