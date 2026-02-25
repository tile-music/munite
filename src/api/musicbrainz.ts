import { createQueue } from "../utils/queue.ts";
import * as log from "../utils/logger.ts";
import { scoreRelease } from "../core/scorer.ts";
import { getConfig } from "../core/config.ts";
import type {
    ReleaseSearchMetadata,
    Recording
} from "../types/common.ts";
import type { ReleaseMetadata, TargetMetadata } from "../types/common.ts";
import type { QueryParam } from "../types/musicbrainz.ts";
import type { Queue } from "../types/queue.ts";
import type {
    MinimalSearchRelease,
    MinimalRelease,
    ReleasesSearchResponse,
    FilterResponse,
    UrlLookupResponse
} from "../types/musicbrainz.ts";

import {
    assertUrlLookupResponse,
    isMusicBrainzErrorResponse
} from "../types/musicbrainz.ts";

let music_brainz_queue: Queue | null = null;

function assembleMusicBrainzRequestURL(
    endpoint: string,
    query_params: QueryParam[] = [],
): string {
    // create base url
    const base_url = getConfig().musicbrainz_api_url;
    const url = new URL(endpoint, base_url);
    url.searchParams.append("fmt", "json");
    url.searchParams.append("limit", "20");

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

async function getReleaseByUrl(
    metadata: ReleaseSearchMetadata,
): Promise<UrlLookupResponse | null> {
    if (!music_brainz_queue) {
        throw new Error("MusicBrainz queue is not initialized");
    }

    if (!metadata.url) {
        throw new Error("Invalid metadata");
    }

    const baseUrl = getConfig().musicbrainz_api_url;
    const url = new URL("url", baseUrl);

    url.searchParams.append("resource", metadata.url);
    url.searchParams.append("inc", "release-rels");
    url.searchParams.append("fmt", "json");

    const response = await music_brainz_queue.enqueue(url.toString());

    if (response.status === 404) {
        log.debug("MusicBrainz URL not found (404)");
        await response.body?.cancel()
        return null;
    }

    const json: unknown = await response.json();

    if (isMusicBrainzErrorResponse(json)) {
        if (json.error === "Not Found") {
            log.debug("MusicBrainz URL not found (error response)");
            return null;
        }

        // Unexpected MB error — surface it
        throw new Error(
            `MusicBrainz error: ${json.error} (${json.help ?? "no help provided"})`,
        );
    }

    assertUrlLookupResponse(json);

    return json;
}

function escapeValue(value: string): string {
    const specialChars = /([+\-!(){}\[\]^"~*?:\\\/])/g;
    return value.replace(specialChars, "\\$1");
}

const removeTrackCount = (p: QueryParam[]): QueryParam[] =>
    p.filter((p) => p.name !== "tracks");

const makeArtistFuzzy = (p: QueryParam[]): QueryParam[] =>
    p.map((p) => (p.name === "artist" ? { ...p, modifier: "fuzzy" } : p));

const makeTitleFuzzy = (p: QueryParam[]): QueryParam[] =>
    p.map((p) => (p.name === "release" ? { ...p, modifier: "fuzzy" } : p));

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
        params = removeTrackCount(params);
    }

    // Stage 3: artist fuzzy
    if (stage >= 2) {
        params = makeArtistFuzzy(params);
    }

    // Stage 4: release fuzzy
    if (stage >= 3) {
        params = makeTitleFuzzy(params);
    }

    // Stage 5+: pop last param repeatedly
    if (stage >= 4 && pop_count > 0) {
        params = params.slice(0, Math.max(0, params.length - pop_count));
    }

    return params;
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
    query_by_url: boolean = true,
): Promise<MinimalSearchRelease[]> {
    if (!music_brainz_queue) {
        throw new Error("MusicBrainz queue is not initialized");
    }

    if (query_by_url) {
        const urlLookup = await getReleaseByUrl(metadata);

        log.debug(
            `MusicBrainz URL lookup: ${JSON.stringify(urlLookup, null, 2)}`,
        );

        const releaseId = urlLookup?.relations
            ?.map(rel => rel.release)
            .find((r): r is NonNullable<typeof r> => r !== undefined)
            ?.id;

        if (releaseId) {
            const url = assembleMusicBrainzRequestURL(
                `release/${releaseId}?inc=artist-credits+release-groups`,
            );

            const response = await music_brainz_queue.enqueue(url, {
                headers: {
                    "User-Agent": "StreamBee/1.0 (mail@samranda.com)",
                },
            });

            const json = await response.json();

            log.debug(
                `MusicBrainz release resolved via URL: ${JSON.stringify(
                    json,
                    null,
                    2,
                )}`,
            );

            return [json];
        }

        log.debug("URL lookup did not resolve to a release, falling back to search");
    }

    const preferred_region = getConfig().preferred_region ?? "US";

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
    ];

    let stage = 0;
    let pop_count = 0;

    while (true) {
        const query_params = buildParamsForStage(base_params, stage, pop_count);

        if (query_params.length === 0) break;

        const url = assembleMusicBrainzRequestURL("release/", query_params);

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

        if (stage < 3) {
            stage++;
        } else {
            pop_count++;
        }
    }

    return [];
}


/**
 * Filters and scores MusicBrainz search results to find the best matching release.
 *
 * This function takes a list of minimal release search results and compares them against
 * target metadata to find the highest-scoring match. Optionally queries the MusicBrainz API
 * for full release details to improve scoring accuracy.
 *
 * @param releases - Array of minimal release search results from MusicBrainz
 * @param metadata - Target metadata containing album title, artists, tracks, and release date to match against
 * @returns Promise resolving to a FilterResponse containing either the best matching release details or an error status
 * @throws Error if the MusicBrainz queue is not initialized
 *
 * @example
 * ```typescript
 * const releases = await searchMusicBrainz("The Dark Side of the Moon");
 * const metadata = { stripped_album_title: "Dark Side", stripped_artists: ["Pink Floyd"], tracks: [...], release_date: "1973" };
 * const result = await filterMusicBrainzResponse(releases, metadata);
 * if (result.status === "success") {
 *   console.log(result.release_id);
 * }
 * ```
 */
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
        release: ReleaseMetadata;
        score: number;
    }[] = [];

    const truncated_releases = releases.slice(0, 20);
    for (const release of truncated_releases) {
        let tracks: Recording[] | null = null;
        // query release
        const url =
            getConfig().musicbrainz_api_url +
            `release/${release.id}?fmt=json&inc=release-groups+recordings`;
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
        tracks = [];
        for (const medium of full_release.media) {
            if (!medium.tracks) continue;
            for (const track of medium.tracks) {
                tracks.push({
                    title: track.title,
                    duration_ms: track.length,
                    id: track.recording.id,
                    first_release_date: track.recording["first-release-date"],
                    track_num: Number(track.number),
                });
            }
        }

        // prepare metadata for scoring
        const release_metadata: ReleaseMetadata = {
            title: release.title,
            artists: release["artist-credit"].map((artist) => artist.name),
            track_count: release["track-count"],
            country: release.country,
            release_date: release.date,
            release_group: {
                type: full_release["release-group"]["primary-type"],
                release_date:
                    full_release["release-group"]["first-release-date"],
                title: full_release["release-group"].title,
                id: full_release["release-group"].id,
            },
            tracks: tracks,
            disambiguation: release.disambiguation,
            id: release.id,
            cover_art: full_release["cover-art-archive"],
        };

        // score release
        const score = scoreRelease(release_metadata, target_metadata);
        scored_releases.push({ release: release_metadata, score });
    }

    // find best scored release
    scored_releases.sort((a, b) => b.score - a.score);

    const best_release = scored_releases[0];
    if (best_release.score <= 50) {
        log.debug(`Release score is low:
            ${JSON.stringify(best_release, null, 2)}`);
        // const query_params = buildParamsForStage([
        //     {
        //     name: "release",
        //     value: target_metadata.title
        //     },
        //     {
        //         name: "artist",
        //         value: target_metadata.artists.join(" AND ")
        //     }
        // ], 0, 0);

        // const url = assembleMusicBrainzRequestURL("release/", query_params);
        // const response = await music_brainz_queue.enqueue(url, {
        //     headers: {
        //         "User-Agent": "StreamBee/1.0 (mail@samranda.com)",
        //     },
        // });

        // if (!response.ok) {
        //     log.error(`MusicBrainz API error: ${response.status}`);
        // } else {
        //     const data: ReleasesSearchResponse = await response.json();
        //         if (data.releases.length > 0) {
        //             const fallback_result = await filterMusicBrainzResponse(data.releases, metadata);
        //             if (
        //                 fallback_result.status === "success" &&
        //                 fallback_result.filter_score > best_release.score
        //             ) {
        //                 log.debug(`Fallback search yielded better score: ${fallback_result.filter_score} > ${best_release.score}`);
        //                 return fallback_result;
        //             }
        //         }
        // }
    }

    const ret: FilterResponse = {
        status: "success",
        release: best_release.release,
        filter_score: best_release.score,
    };

    return ret;
}
