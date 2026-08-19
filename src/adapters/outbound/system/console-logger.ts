/**
 * ConsoleLogger — adapter stderr du port Logger. Port fidèle de
 * arka-cc-management (adapters/outbound/system/console-logger.ts).
 *
 * Sortie sur STDERR (jamais stdout, réservé au frame buffer de la TUI).
 * JSON-line si non-TTY, pretty single-line si TTY. Niveaux filtrés par
 * seuil. child(fields) accumule des bindings sans re-threader partout.
 */
import type { Logger, LogFields, LogLevel } from "../../../ports/outbound/logger.js";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFormat = "json" | "pretty";

export interface LogSink {
  write(line: string): void;
}

export interface ConsoleLoggerOptions {
  readonly threshold?: LogLevel;
  readonly format?: LogFormat;
  readonly sink?: LogSink;
  readonly now?: () => Date;
}

interface InternalState {
  readonly threshold: LogLevel;
  readonly format: LogFormat;
  readonly sink: LogSink;
  readonly now: () => Date;
  readonly bindings: LogFields;
}

const DEFAULT_SINK: LogSink = {
  write(line: string): void {
    process.stderr.write(`${line}\n`);
  },
};

function defaultFormat(): LogFormat {
  return process.stderr.isTTY ? "pretty" : "json";
}

export class ConsoleLogger implements Logger {
  private readonly state: InternalState;

  public constructor(options: ConsoleLoggerOptions = {}) {
    this.state = {
      threshold: options.threshold ?? "info",
      format: options.format ?? defaultFormat(),
      sink: options.sink ?? DEFAULT_SINK,
      now: options.now ?? ((): Date => new Date()),
      bindings: {},
    };
  }

  private static withState(state: InternalState): ConsoleLogger {
    const inst = Object.create(ConsoleLogger.prototype) as ConsoleLogger;
    (inst as unknown as { state: InternalState }).state = state;
    return inst;
  }

  public debug(message: string, fields?: LogFields): void {
    this.emit("debug", message, fields);
  }

  public info(message: string, fields?: LogFields): void {
    this.emit("info", message, fields);
  }

  public warn(message: string, fields?: LogFields): void {
    this.emit("warn", message, fields);
  }

  public error(message: string, fields?: LogFields): void {
    this.emit("error", message, fields);
  }

  public child(fields: LogFields): Logger {
    return ConsoleLogger.withState({ ...this.state, bindings: { ...this.state.bindings, ...fields } });
  }

  private emit(level: LogLevel, message: string, fields: LogFields | undefined): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.state.threshold]) return;
    const merged: LogFields = { ...this.state.bindings, ...(fields ?? {}) };
    const ts = this.state.now().toISOString();
    const line = this.state.format === "json" ? formatJson(ts, level, message, merged) : formatPretty(ts, level, message, merged);
    this.state.sink.write(line);
  }
}

function formatJson(ts: string, level: LogLevel, message: string, fields: LogFields): string {
  const head = { ts, level, message };
  const body = Object.keys(fields).length === 0 ? head : { ...head, ...fields };
  return JSON.stringify(body);
}

function formatPretty(ts: string, level: LogLevel, message: string, fields: LogFields): string {
  const tag = level.toUpperCase().padEnd(5);
  const fieldsPart =
    Object.keys(fields).length === 0 ? "" : ` ${Object.entries(fields).map(([k, v]) => `${k}=${stringifyValue(v)}`).join(" ")}`;
  return `${ts} [${tag}] ${message}${fieldsPart}`;
}

function stringifyValue(v: unknown): string {
  if (typeof v === "string") return v.includes(" ") || v.includes('"') ? JSON.stringify(v) : v;
  if (typeof v === "number" || typeof v === "boolean" || v === null) return String(v);
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable]";
  }
}
