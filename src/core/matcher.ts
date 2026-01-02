import { load } from "@std/dotenv";
import { initializeSpotifyQueue } from "../api/spotify.ts";
import {
    initializeMusicBrainzQueue,
    filterMusicBrainzResponse,
    queryMusicBrainzReleases,
} from "../api/musicbrainz.ts";
import * as log from "../utils/logger.ts";
import type { LogLevel } from "../types/logger.ts";
import type { FilterResponse } from "../types/musicbrainz.ts";
import type { ReleaseSearchMetadata } from "../types/common.ts";

await load({ export: true });

function verifyEnvironmentVariables() {
    const requiredVars = [
        "MUSICBRAINZ_API_URL",
        "MAX_MUSICBRAINZ_REQUESTS_PER_SECOND",
        "SPOTIFY_CLIENT_ID",
        "SPOTIFY_CLIENT_SECRET",
        "MAX_SPOTIFY_REQUESTS_PER_SECOND",
        "QUERY_RELEASE",
        "LOG_LEVEL",
    ];

    for (const varName of requiredVars) {
        if (!Deno.env.get(varName)) {
            throw new Error(`Environment variable ${varName} is not set.`);
        }
    }
}

export async function init() {
    verifyEnvironmentVariables();

    initializeMusicBrainzQueue(
        Number(Deno.env.get("MAX_MUSICBRAINZ_REQUESTS_PER_SECOND")),
    );
    await initializeSpotifyQueue(
        Number(Deno.env.get("MAX_SPOTIFY_REQUESTS_PER_SECOND")),
    );

    log.setLogLevel((Deno.env.get("LOG_LEVEL") as LogLevel) || "info");
    log.enableLogging();
}

export async function matchAlbum(
    metadata: ReleaseSearchMetadata,
): Promise<FilterResponse> {
    const releases = await queryMusicBrainzReleases(metadata);
    const response = await filterMusicBrainzResponse(releases, metadata);
    return response;
}
