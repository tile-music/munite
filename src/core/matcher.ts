import { initializeSpotifyQueue } from "../api/spotify.ts";
import { initializeAppleMusicQueue } from "../api/appleMusic.ts";
import {
    initializeMusicBrainzQueue,
    filterMusicBrainzResponse,
    queryMusicBrainzReleases,
} from "../api/musicbrainz.ts";
import { setConfig } from "./config.ts";
import * as log from "../utils/logger.ts";
import type { LogLevel } from "../types/logger.ts";
import type { FilterResponse } from "../types/musicbrainz.ts";
import type { ReleaseSearchMetadata } from "../types/common.ts";
import type { MuniteConfig } from "./config.ts";

function verifyConfig(config: MuniteConfig) {
    const requiredFields: Array<keyof MuniteConfig> = [
        "musicbrainz_api_url",
        "max_musicbrainz_requests_per_second",
        "spotify_client_id",
        "spotify_client_secret",
        "max_spotify_requests_per_second",
        "query_release",
        "apple_music_developer_token",
        "apple_music_storefront"
    ];

    for (const fieldName of requiredFields) {
        const value = config[fieldName];
        if (value === undefined || value === null || value === "") {
            throw new Error(`Config field ${String(fieldName)} is not set.`);
        }
    }
}

export async function init(config: MuniteConfig) {
    verifyConfig(config);
    setConfig(config);

    initializeMusicBrainzQueue(
        Number(config.max_musicbrainz_requests_per_second),
    );
    await initializeSpotifyQueue(
        Number(config.max_spotify_requests_per_second),
    );
    await initializeAppleMusicQueue(
        Number(config.max_spotify_requests_per_second),
    );

    log.setLogLevel((config.log_level as LogLevel) || "info");
    log.enableLogging();
}

export async function matchAlbum(
    metadata: ReleaseSearchMetadata,
): Promise<FilterResponse> {
    const releases = await queryMusicBrainzReleases(metadata);
    const response = await filterMusicBrainzResponse(releases, metadata);
    return response;
}
