import type { LogLevel } from "../types/logger.ts";

export type MuniteConfig = {
    musicbrainz_api_url: string;
    max_musicbrainz_requests_per_second: number;
    spotify_client_id: string;
    spotify_client_secret: string;
    max_spotify_requests_per_second: number;
    query_release: string;
    log_level?: LogLevel;
    preferred_region?: string;
    spotify_access_token?: string;
    retry_count?: number;
};

let config: MuniteConfig | null = null;

export function setConfig(nextConfig: MuniteConfig) {
    config = nextConfig;
}

export function getConfig(): MuniteConfig {
    if (!config) {
        throw new Error(
            "Munite config has not been set. Call init(config) before use.",
        );
    }
    return config;
}
