export type LogLevel = "debug" | "info" | "warn" | "error";

const state = {
    level: "info" as LogLevel,
    enabled: false,
};

const levels: LogLevel[] = ["debug", "info", "warn", "error"];

function shouldLog(level: LogLevel): boolean {
    if (!state.enabled) return false;
    return levels.indexOf(level) >= levels.indexOf(state.level);
}

export function debug(message: string, data?: unknown) {
    if (shouldLog("debug")) {
        console.log(`[DEBUG] ${message}`, data ?? "");
    }
}

export function info(message: string, data?: unknown) {
    if (shouldLog("info")) {
        console.log(`[INFO] ${message}`, data ?? "");
    }
}

export function warn(message: string, data?: unknown) {
    if (shouldLog("warn")) {
        console.warn(`[WARN] ${message}`, data ?? "");
    }
}

export function error(message: string, data?: unknown) {
    if (shouldLog("error")) {
        console.error(`[ERROR] ${message}`, data ?? "");
    }
}

export function enable() {
    state.enabled = true;
}

export function disable() {
    state.enabled = false;
}

export function setLevel(level: LogLevel) {
    state.level = level;
}
