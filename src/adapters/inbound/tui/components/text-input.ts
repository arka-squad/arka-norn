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

import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Theme } from "../runtime/theme.js";
import { translate } from "../../../../application/localization/locale.js";

const CURSOR_GLYPH = String.fromCharCode(0x2588); // █

export interface TextInputOptions {
  readonly title?: string;
  readonly hint?: string;
  readonly initialValue?: string;
  readonly required?: boolean;
  readonly onSubmit: (value: string) => void;
  readonly onCancel?: () => void;
}

export interface TextInputScene {
  onKey(event: KeyEvent): "pop" | "consumed" | undefined;
  render(renderer: Renderer, theme: Theme): void;
  readonly value: string;
}

export function createTextInputScene(options: TextInputOptions): TextInputScene {
  let value = options.initialValue ?? "";

  return {
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      if (event.kind === "escape") {
        options.onCancel?.();
        return "pop";
      }
      if (event.kind === "enter") {
        if (value.trim() === "" && options.required !== false) return "consumed";
        options.onSubmit(value);
        return "consumed";
      }
      if (event.kind === "backspace") {
        value = value.slice(0, -1);
        return "consumed";
      }
      if (event.kind === "char") {
        value += event.value;
        return "consumed";
      }
      if (event.kind === "filter") {
        value += "/";
        return "consumed";
      }
      if (event.kind === "help") {
        value += "?";
        return "consumed";
      }
      if (event.kind === "quit") {
        value += "q";
        return "consumed";
      }
      return "consumed";
    },
    render(renderer: Renderer, theme: Theme): void {
      renderer.redraw((line) => {
        if (options.title !== undefined) {
          line(`  ${theme.bold(options.title)}`);
          line("");
        }
        if (options.hint !== undefined) {
          line(`  ${theme.dim(options.hint)}`);
          line("");
        }
        line(`  ${theme.arkaAccent(">")} ${value}${theme.dim(CURSOR_GLYPH)}`);
        line("");
        line(`  ${theme.dim(translate("tui.input.hint"))}`);
      });
    },
    get value(): string {
      return value;
    },
  };
}
