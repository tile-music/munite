import type { LogLevel } from "../types/logger.ts";

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

export function enableLogging() {
    state.enabled = true;
}

export function disableLogging() {
    state.enabled = false;
}

export function setLogLevel(level: LogLevel) {
    state.level = level;
}
