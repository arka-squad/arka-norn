/**
 * Render -- buffered string-based frame writer, redraw stable via
 * `ESC[NA ESC[J`. Port TS fidèle de arka-cc-management
 * (adapters/inbound/tui/runtime/render.ts). Pas de diff char-by-char.
 */
const ESC = String.fromCharCode(0x1b);
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const CLEAR_FROM_CURSOR_DOWN = `${ESC}[J`;

function cursorUp(n: number): string {
  if (n <= 0) return "";
  return `${ESC}[${n}A`;
}

export interface RenderStream {
  write(chunk: string): boolean | void;
  readonly isTTY?: boolean | undefined;
  readonly columns?: number | undefined;
  readonly rows?: number | undefined;
}

export interface RendererOptions {
  readonly hideCursor?: boolean;
}

export interface Renderer {
  begin(): void;
  line(s: string): void;
  commit(): void;
  redraw(fn: (line: (s: string) => void) => void): void;
  destroy(): void;
  readonly lastFrameLines: number;
}

export function createRenderer(stream: RenderStream, options: RendererOptions = {}): Renderer {
  const isTTY = Boolean(stream.isTTY);
  const hideCursor = options.hideCursor ?? isTTY;
  let buffer: string[] = [];
  let lastLines = 0;
  let cursorHidden = false;
  let destroyed = false;

  function ensureCursorHidden(): void {
    if (!hideCursor || cursorHidden) return;
    stream.write(CURSOR_HIDE);
    cursorHidden = true;
  }

  function emitFrame(): void {
    if (buffer.length === 0) {
      lastLines = 0;
      return;
    }
    const terminalRows = isTTY ? stream.rows : undefined;
    const maximum = terminalRows !== undefined && terminalRows > 2 ? terminalRows - 1 : buffer.length;
    const visible = buffer.length > maximum
      ? [...buffer.slice(0, Math.max(1, maximum - 1)), `… ${buffer.length - maximum + 1} ligne(s) masquée(s) — utilise les vues scrollables`]
      : buffer;
    stream.write(`${visible.join("\n")}\n`);
    lastLines = visible.length;
  }

  function rewindAndClear(): void {
    if (lastLines === 0) return;
    if (!isTTY) return;
    stream.write(`${cursorUp(lastLines)}${CLEAR_FROM_CURSOR_DOWN}`);
  }

  return {
    begin(): void {
      if (destroyed) return;
      buffer = [];
    },
    line(s: string): void {
      if (destroyed) return;
      buffer.push(s);
    },
    commit(): void {
      if (destroyed) return;
      ensureCursorHidden();
      emitFrame();
    },
    redraw(fn): void {
      if (destroyed) return;
      ensureCursorHidden();
      rewindAndClear();
      buffer = [];
      fn((s) => buffer.push(s));
      emitFrame();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      rewindAndClear();
      lastLines = 0;
      if (cursorHidden) {
        stream.write(CURSOR_SHOW);
        cursorHidden = false;
      }
    },
    get lastFrameLines(): number {
      return lastLines;
    },
  };
}
