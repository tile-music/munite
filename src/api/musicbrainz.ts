import { createQueue } from "../utils/queue.ts";
import * as log from "../utils/logger.ts";
import { scoreRelease } from "../core/scorer.ts";
import type { ReleaseSearchMetadata } from "../types/validator.ts";
import type { ReleaseMetadata, TargetMetadata } from "../types/common.ts";
import type { QueryParam } from "../types/musicbrainz.ts";
import type { Queue } from "../types/queue.ts";
import type {
    MinimalSearchRelease,
    MinimalRelease,
    ReleasesSearchResponse,
    FilterResponse,

} from "../types/musicbrainz.ts";

let music_brainz_queue: Queue | null = null;

/**
 * This function consumes the name of a track and returns whether that track
 * name possibly contains leet speak
 * @param name the name of a track
 * @returns a boolean indicating if the track name possibly contains leet speak
 */
function isPossiblyLeet(name: string): boolean {
  const LEET_CHARS =
    /[0-9@#$!|\/\\<>\[\]_+\-.,:^~©¢£₤€ƒ¶₱ßΩΘØ∆√♪№¿?]/u;

// Cyrillic + Greek homoglyphs commonly used in leet
  const LEET_HOMOGLYPHS =
    /[аАеЕоОрРсСнНмМиИвВьЬпПөӨөΩΘΔ]/u;
  return LEET_CHARS.test(name) || LEET_HOMOGLYPHS.test(name);
}

function assembleMusicBrainzRequestURL(
    endpoint: string,
    query_params: QueryParam[] = [],
): string {
    // create base url
    const base_url = Deno.env.get("MUSICBRAINZ_API_URL");
    const url = new URL(endpoint, base_url);
    url.searchParams.append("fmt", "json");
    url.searchParams.append("limit", "100");



    // assemble query
    let query = "";
    for (const param of query_params) {
        if (query.length > 0) query += " AND ";
        const escaped_value = escapeValue(param.value);

        let modified_value = escaped_value;
        if (param.modifier === "fuzzy") {
            modified_value = `(${escaped_value})~`;
        } else if (param.modifier === "exact") {
            modified_value = `"${escaped_value}"`;
        }

        query += `${param.name}:${modified_value}`;
    }
    url.searchParams.append("query", query.trim());
    log.debug(`MusicBrainz request URL: ${url.toString()}`);
    return url.toString();
}

function escapeValue(value: string): string {
    const specialChars = /([+\-!(){}\[\]^"~*?:\\\/])/g;
    return value.replace(specialChars, "\\$1");
}

export function initializeMusicBrainzQueue(req_per_sec: number) {
    if (music_brainz_queue) return;

    music_brainz_queue = createQueue();
    const interval = 1000 / req_per_sec;
    setInterval(music_brainz_queue!.process, interval);
    log.info("Initialized MusicBrainz queue");
}

export async function queryMusicBrainzReleases(
    metadata: ReleaseSearchMetadata,
): Promise<MinimalSearchRelease[]> {
    if (!music_brainz_queue) {
        throw new Error("MusicBrainz queue is not initialized");
    }

    let prefered_region = Deno.env.get("PREFERED_REGION");
    if(!prefered_region) prefered_region = "US"

    const base_params: QueryParam[] = [
        {
            name: "artist",
            value: metadata.stripped_artists.join(" "),
        },
        {
            name: "release",
            value: metadata.stripped_album_title,
        },
        {
            name: "format",
            value: "digitalmedia",
        },
        {
            name: "status",
            value: "official",
        },
        {
            name: "tracks",
            value: metadata.tracks.length.toString(),
        },
        // {
        //     name: "country",
        //     value: prefered_region
        // }
    ];

    // Track the same relaxation stages as the original loop
    let stage = 0;
    let pop_count = 0;

    while (true) {
        const query_params = buildParamsForStage(
            base_params,
            stage,
            pop_count,
        );

        if (query_params.length === 0) {
            break;
        }

        const url = assembleMusicBrainzRequestURL(
            "release/",
            query_params,
        );

        const response = await music_brainz_queue.enqueue(url, {
            headers: {
                "User-Agent": "StreamBee/1.0 (mail@samranda.com)",
            },
        });

        if (!response.ok) {
            log.error(`MusicBrainz API error: ${response.status}`);
            break;
        }

        const data: ReleasesSearchResponse = await response.json();
        if (data.releases.length > 0) {
            return data.releases;
        }

        log.debug(
            `No results for query params: ${JSON.stringify(
                query_params,
            )}, relaxing search...`,
        );

        // Advance relaxation state (exact same order as original)
        if (stage < 3) {
            stage++;
        } else {
            pop_count++;
        }
    }

    return [];
}

function buildParamsForStage(
    base_params: QueryParam[],
    stage: number,
    pop_count: number,
): QueryParam[] {
    let params = base_params.map((p) => ({ ...p }));

    // Stage 1: remove country preference
    // if(stage >= 1) {
    //     params = params.filter((p) => p.name !== "country")
    // }

    // stage 2: remove track count
    if (stage >= 1) {
        params = params.filter((p) => p.name !== "tracks");
    }

    // Stage 3: artist fuzzy
    if (stage >= 2) {
        params = params.map((p) =>
            p.name === "artist"
                ? { ...p, modifier: "fuzzy" }
                : p,
        );
    }

    // Stage 4: release fuzzy
    if (stage >= 3) {
        params = params.map((p) =>
            p.name === "release"
                ? { ...p, modifier: "fuzzy" }
                : p,
        );
    }

    // Stage 5+: pop last param repeatedly
    if (stage >= 4 && pop_count > 0) {
        params = params.slice(0, Math.max(0, params.length - pop_count));
    }

    return params;
}

export async function filterMusicBrainzResponse(
    releases: MinimalSearchRelease[],
    metadata: ReleaseSearchMetadata,
): Promise<FilterResponse> {
    if (!music_brainz_queue) {
        throw new Error("MusicBrainz queue is not initialized");
    }

    if (releases.length === 0) {
        return {
            status: "error",
            message: "No releases found",
        };
    }

    const target_metadata: TargetMetadata = {
        title: metadata.stripped_album_title,
        artists: metadata.stripped_artists,
        tracks: metadata.tracks,
        release_date: metadata.release_date,
    };

    const scored_releases: {
        release: MinimalSearchRelease;
        score: number;
    }[] = [];

    for (const release of releases) {
        let release_group_release_date: string | null = null;
        let tracks: { name: string; duration_ms: number }[] | null = null;

        if (Deno.env.get("QUERY_RELEASE") === "true") {
            // query release
            const url =
                Deno.env.get("MUSICBRAINZ_API_URL") +
                `release/${release.id}?fmt=json&inc=release-groups+recordings&limit=100`;
            const response = await music_brainz_queue.enqueue(url, {
                headers: {
                    "User-Agent": "StreamBee/1.0 (mail@samranda.com)",
                },
            });

            if (!response.ok) {
                log.error(
                    `MusicBrainz API error when fetching release ${release.id}: ${response.status}`,
                );
                continue;
            }

            const full_release: MinimalRelease = await response.json();
            release_group_release_date =
                full_release["release-group"]["first-release-date"];

            tracks = [];
            for (const medium of full_release.media) {
                for (const track of medium.tracks) {
                    tracks.push({
                        name: track.title,
                        duration_ms: track.length,
                    });
                }
            }
        }

        // prepare metadata for scoring
        const release_metadata: ReleaseMetadata = {
            title: release.title,
            artists: release["artist-credit"].map((artist) => artist.name),
            track_count: release["track-count"],
            country: release.country,
            release_date: release.date,
            release_group_release_date,
            tracks: null,
            disambiguation: release.disambiguation,
        };

        // score release
        const score = scoreRelease(release_metadata, target_metadata);
        scored_releases.push({ release, score });
    }

    // find best scored release
    scored_releases.sort((a, b) => b.score - a.score);
    const best_release = scored_releases[0];
    const release = best_release.release;

    return {
        status: "success",
        release_id: release.id,
        release_group_id: release["release-group"].id,
        query_score: release.score,
        filter_store: best_release.score,
    };
}
