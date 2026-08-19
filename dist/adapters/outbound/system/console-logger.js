const LEVEL_ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
const DEFAULT_SINK = {
    write(line) {
        process.stderr.write(`${line}\n`);
    },
};
function defaultFormat() {
    return process.stderr.isTTY ? "pretty" : "json";
}
export class ConsoleLogger {
    state;
    constructor(options = {}) {
        this.state = {
            threshold: options.threshold ?? "info",
            format: options.format ?? defaultFormat(),
            sink: options.sink ?? DEFAULT_SINK,
            now: options.now ?? (() => new Date()),
            bindings: {},
        };
    }
    static withState(state) {
        const inst = Object.create(ConsoleLogger.prototype);
        inst.state = state;
        return inst;
    }
    debug(message, fields) {
        this.emit("debug", message, fields);
    }
    info(message, fields) {
        this.emit("info", message, fields);
    }
    warn(message, fields) {
        this.emit("warn", message, fields);
    }
    error(message, fields) {
        this.emit("error", message, fields);
    }
    child(fields) {
        return ConsoleLogger.withState({ ...this.state, bindings: { ...this.state.bindings, ...fields } });
    }
    emit(level, message, fields) {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[this.state.threshold])
            return;
        const merged = { ...this.state.bindings, ...(fields ?? {}) };
        const ts = this.state.now().toISOString();
        const line = this.state.format === "json" ? formatJson(ts, level, message, merged) : formatPretty(ts, level, message, merged);
        this.state.sink.write(line);
    }
}
function formatJson(ts, level, message, fields) {
    const head = { ts, level, message };
    const body = Object.keys(fields).length === 0 ? head : { ...head, ...fields };
    return JSON.stringify(body);
}
function formatPretty(ts, level, message, fields) {
    const tag = level.toUpperCase().padEnd(5);
    const fieldsPart = Object.keys(fields).length === 0 ? "" : ` ${Object.entries(fields).map(([k, v]) => `${k}=${stringifyValue(v)}`).join(" ")}`;
    return `${ts} [${tag}] ${message}${fieldsPart}`;
}
function stringifyValue(v) {
    if (typeof v === "string")
        return v.includes(" ") || v.includes('"') ? JSON.stringify(v) : v;
    if (typeof v === "number" || typeof v === "boolean" || v === null)
        return String(v);
    if (v === undefined)
        return "undefined";
    try {
        return JSON.stringify(v);
    }
    catch {
        return "[unserializable]";
    }
}
//# sourceMappingURL=console-logger.js.map