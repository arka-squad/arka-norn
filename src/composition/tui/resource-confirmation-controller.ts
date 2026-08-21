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

import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import type { TuiApp } from "../../adapters/inbound/tui/runtime/tui-app.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { Project } from "../../domain/project/project.js";
import type { ForFeatures } from "../../ports/inbound/for-features.js";
import type { ForProjects } from "../../ports/inbound/for-projects.js";

export interface ResourceConfirmationController {
  forgetFeature(feature: Feature): void;
  forgetProject(project: Project): void;
}

export function createResourceConfirmationController(deps: {
  readonly app: TuiApp;
  readonly projects: ForProjects;
  readonly features: ForFeatures;
  readonly onFeatureForgotten: () => void;
  readonly onProjectForgotten: () => void;
}): ResourceConfirmationController {
  return {
    forgetFeature(feature): void {
      confirm({
        title: `Retirer "${feature.name}" ?`,
        confirmLabel: `Oui, retirer "${feature.name}" de l'index`,
        run: () => deps.features.forget(feature.id),
        onSuccess: deps.onFeatureForgotten,
      });
    },
    forgetProject(project): void {
      confirm({
        title: `Retirer "${project.name}" ?`,
        confirmLabel: `Oui, retirer "${project.name}" de l'index`,
        run: () => deps.projects.forget(project.id),
        onSuccess: deps.onProjectForgotten,
      });
    },
  };

  function confirm(input: {
    readonly title: string;
    readonly confirmLabel: string;
    readonly run: () => Promise<void>;
    readonly onSuccess: () => void;
  }): void {
    deps.app.push(createMenuScene(
      [
        { label: input.confirmLabel, value: "confirm" as const },
        { label: "Annuler", value: "cancel" as const },
      ],
      {
        title: input.title,
        hint: "Les fichiers métier restent sur disque ; seule l'entrée d'index est retirée.",
        onSelect: (choice) => {
          deps.app.pop();
          if (choice === "cancel") return;
          void input.run().then(
            input.onSuccess,
            (error: unknown) => deps.app.push(createResultView({ title: "Retrait impossible", code: 1, output: error instanceof Error ? error.message : String(error), onBack: () => {} })),
          );
        },
        onCancel: () => {},
      },
    ));
  }
}
