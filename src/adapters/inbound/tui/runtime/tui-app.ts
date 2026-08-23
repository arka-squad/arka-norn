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

import type { ContextInfo } from "../components/banner.js";
import { renderContextBanner } from "../components/banner.js";
import { formatNumber, translate } from "../../../../application/localization/locale.js";
import type { InputSource, KeyEvent } from "./input.js";
import type { Renderer } from "./render.js";
import type { Theme } from "./theme.js";

export interface Scene {
  onKey(event: KeyEvent): "pop" | "consumed" | undefined;
  render(renderer: Renderer, theme: Theme): void;
  readonly chrome?:
    | {
        readonly header?: boolean;
        readonly contextBanner?: boolean;
      }
    | undefined;
}

export interface BannerSources {
  /** Persistent full-page header above all content. */
  readonly header?: () => readonly string[];
  /** Runtime, root, and Feature context banner below the header. */
  readonly context?: () => ContextInfo;
}

export interface TuiAppDeps {
  readonly input: InputSource;
  readonly renderer: Renderer;
  readonly theme: Theme;
  readonly banners?: BannerSources;
  readonly viewport?: () => { readonly columns?: number; readonly rows?: number };
}

export interface TuiApp {
  push(scene: Scene): void;
  pop(): void;
  topScene(): Scene | undefined;
  redraw(): void;
  run(): Promise<void>;
}

export interface TuiAppRunOptions {
  readonly registerProcessHandlers?: boolean;
}

export function createTuiApp(deps: TuiAppDeps): TuiApp & { run(opts?: TuiAppRunOptions): Promise<void> } {
  const { input, renderer, theme, banners } = deps;
  const stack: Scene[] = [];
  let resolveRun: (() => void) | null = null;
  let cleanupRegistered = false;
  let cleanupHandlers: { signal: NodeJS.Signals | "exit"; handler: () => void }[] = [];
  let resizeHandler: (() => void) | undefined;
  let running = false;

  function topScene(): Scene | undefined {
    return stack[stack.length - 1];
  }

  function renderTop(): void {
    const top = topScene();
    if (top === undefined) return;
    const columns = deps.viewport?.().columns;
    if (columns !== undefined && columns < 60) {
      renderer.redraw((line) => {
        line(translate("tui.terminal.narrow"));
        line(translate("tui.terminal.width", { columns: formatNumber(columns), minimum: formatNumber(60) }));
        line(translate("tui.terminal.resize"));
      });
      return;
    }
    renderer.redraw((line) => {
      const chrome = top.chrome ?? {};
      if (chrome.header !== false && banners?.header !== undefined) {
        for (const l of banners.header()) line(l);
      }
      if (chrome.contextBanner !== false && banners?.context !== undefined) {
        for (const l of renderContextBanner(banners.context(), theme)) line(l);
        line("");
      }

      const captured: string[] = [];
      const sceneRenderer: Renderer = {
        begin: () => {
          captured.length = 0;
        },
        line: (s) => {
          captured.push(s);
        },
        commit: () => {},
        redraw: (fn) => {
          captured.length = 0;
          fn((s) => captured.push(s));
        },
        destroy: () => {},
        get lastFrameLines(): number {
          return captured.length;
        },
      };
      top.render(sceneRenderer, theme);
      for (const l of captured) line(l);
    });
  }

  function dispatchKey(event: KeyEvent): void {
    if (event.kind === "interrupt") {
      stack.length = 0;
      finishRun();
      return;
    }
    const top = topScene();
    if (top === undefined) {
      finishRun();
      return;
    }
    const result = top.onKey(event);
    if (result === "pop") {
      stack.pop();
      if (stack.length === 0) {
        finishRun();
        return;
      }
    }
    renderTop();
  }

  function finishRun(): void {
    if (resolveRun !== null) {
      const r = resolveRun;
      resolveRun = null;
      r();
    }
  }

  function registerHandlers(): void {
    if (cleanupRegistered) return;
    cleanupRegistered = true;
    const onSignal = (signal: NodeJS.Signals | "exit"): (() => void) => {
      return (): void => {
        try {
          input.stop();
          renderer.destroy();
        } catch {
          // best-effort during process teardown
        }
        if (signal === "SIGINT" || signal === "SIGTERM") {
          process.exit(signal === "SIGINT" ? 130 : 143);
        }
      };
    };
    const handlers: { signal: NodeJS.Signals | "exit"; handler: () => void }[] = [
      { signal: "SIGINT", handler: onSignal("SIGINT") },
      { signal: "SIGTERM", handler: onSignal("SIGTERM") },
      { signal: "exit", handler: onSignal("exit") },
    ];
    for (const { signal, handler } of handlers) {
      process.on(signal, handler);
    }
    cleanupHandlers = handlers;
    resizeHandler = () => renderTop();
    process.stdout.on("resize", resizeHandler);
  }

  function unregisterHandlers(): void {
    if (!cleanupRegistered) return;
    for (const { signal, handler } of cleanupHandlers) {
      process.off(signal, handler);
    }
    cleanupHandlers = [];
    if (resizeHandler !== undefined) process.stdout.off("resize", resizeHandler);
    resizeHandler = undefined;
    cleanupRegistered = false;
  }

  return {
    push(scene: Scene): void {
      stack.push(scene);
      if (running) renderTop();
    },
    pop(): void {
      stack.pop();
      if (stack.length === 0) {
        finishRun();
        return;
      }
      if (running) renderTop();
    },
    topScene,
    redraw: renderTop,
    async run(opts: TuiAppRunOptions = {}): Promise<void> {
      const registerSig = opts.registerProcessHandlers ?? true;
      running = true;
      input.start();
      if (registerSig) registerHandlers();
      const unsubKey = input.on(dispatchKey);
      try {
        renderTop();
        await new Promise<void>((resolve) => {
          resolveRun = resolve;
          if (stack.length === 0) {
            const r = resolveRun;
            resolveRun = null;
            r();
          }
        });
      } finally {
        running = false;
        unsubKey();
        try {
          input.stop();
        } catch {
          // best-effort
        }
        try {
          renderer.destroy();
        } catch {
          // best-effort
        }
        unregisterHandlers();
      }
    },
  };
}
