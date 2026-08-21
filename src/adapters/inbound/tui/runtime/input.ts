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
 * Input -- raw-mode keyboard input source. Port TS fidèle de
 * arka-cc-management (adapters/inbound/tui/runtime/input.ts).
 *
 * TTY guard : si stdin.isTTY === false, start() ne fait rien.
 * Cleanup : stop() retire le listener, repasse en cooked mode, idempotent.
 */
import { emitKeypressEvents } from "node:readline";

export type KeyEvent =
  | { readonly kind: "up" }
  | { readonly kind: "down" }
  | { readonly kind: "left" }
  | { readonly kind: "right" }
  | { readonly kind: "enter" }
  | { readonly kind: "escape" }
  | { readonly kind: "backspace" }
  | { readonly kind: "tab" }
  | { readonly kind: "quit" }
  | { readonly kind: "filter" }
  | { readonly kind: "interrupt" }
  | { readonly kind: "help" }
  | { readonly kind: "refresh" }
  | { readonly kind: "char"; readonly value: string };

export interface KeypressInfo {
  readonly name?: string | undefined;
  readonly ctrl?: boolean | undefined;
  readonly meta?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly sequence?: string | undefined;
}

export interface InputStream {
  isTTY?: boolean | undefined;
  setRawMode?(value: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  on(event: "keypress", listener: (ch: string | undefined, key: KeypressInfo | undefined) => void): unknown;
  removeListener(event: "keypress", listener: (ch: string | undefined, key: KeypressInfo | undefined) => void): unknown;
}

export type KeyListener = (event: KeyEvent) => void;

export interface InputSource {
  start(): void;
  stop(): void;
  on(listener: KeyListener): () => void;
}

export function mapKeypress(ch: string | undefined, info: KeypressInfo | undefined): KeyEvent | undefined {
  if (info === undefined) return undefined;
  if (info.ctrl === true && info.name === "c") return { kind: "interrupt" };

  switch (info.name) {
    case "up":
      return { kind: "up" };
    case "down":
      return { kind: "down" };
    case "left":
      return { kind: "left" };
    case "right":
      return { kind: "right" };
    case "return":
      return { kind: "enter" };
    case "escape":
      return { kind: "escape" };
    case "backspace":
      return { kind: "backspace" };
    case "tab":
      return { kind: "tab" };
    default:
      break;
  }

  if (ch === undefined || ch === "") return undefined;
  if (info.ctrl === true || info.meta === true) return undefined;

  if (ch === "q") return { kind: "quit" };
  if (ch === "/") return { kind: "filter" };
  if (ch === "?") return { kind: "help" };

  return { kind: "char", value: ch };
}

export function createInputSource(stdin: InputStream): InputSource {
  const listeners = new Set<KeyListener>();
  let started = false;

  const onKeypress = (ch: string | undefined, info: KeypressInfo | undefined): void => {
    const event = mapKeypress(ch, info);
    if (event === undefined) return;
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[arka-norn-tui] input listener threw: ${message}\n`);
      }
    }
  };

  return {
    start(): void {
      if (started) return;
      if (stdin.isTTY !== true) return;
      emitKeypressEvents(stdin as Parameters<typeof emitKeypressEvents>[0]);
      stdin.setRawMode?.(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      stdin.on("keypress", onKeypress);
      started = true;
    },
    stop(): void {
      if (!started) return;
      stdin.removeListener("keypress", onKeypress);
      stdin.setRawMode?.(false);
      stdin.pause();
      started = false;
    },
    on(listener: KeyListener): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}
