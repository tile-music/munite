import { createQueue, type Queue } from "./queue.ts";
import { ReleaseSearchMetadata } from "./validate.ts";
import * as log from "./log.ts";
import type { ReleaseMetadata, TargetMetadata } from "./score.ts";
import { scoreRelease } from "./score.ts";

let music_brainz_queue: Queue | null = null;

type QueryParam = {
    name: string;
    value: string;
    modifier?: "exact" | "fuzzy";
};

type ReleasesSearchResponse = {
    count: number;
    releases: MinimalSearchRelease[];
};

type MinimalSearchRelease = {
    id: string;
    score: number;
    title: string;
    date: string;
    country: string | null;
    disambiguation: string | null;
    "track-count": number;
    "artist-credit": {
        name: string;
    }[];
    "release-group": {
        id: string;
    };
};

type MinimalRelease = {
    "release-group": {
        id: string;
        title: string;
        disambiguation: string;
        "primary-type": string;
        "secondary-types": string[];
        "first-release-date": string;
    };
    media: {
        tracks: {
            title: string;
            length: number;
        }[];
    }[];
};

function assembleMusicBrainzRequestURL(
    endpoint: string,
    query_params: QueryParam[] = [],
): string {
    // create base url
    const base_url = Deno.env.get("MUSICBRAINZ_API_URL");
    const url = new URL(endpoint, base_url);
    url.searchParams.append("fmt", "json");

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
    setInterval(music_brainz_queue.process, interval);
    log.info("Initialized MusicBrainz queue");
}

export async function queryMusicBrainzReleases(
    metadata: ReleaseSearchMetadata,
): Promise<MinimalSearchRelease[]> {
    if (!music_brainz_queue) {
        throw new Error("MusicBrainz queue is not initialized");
    }

    const query_params: QueryParam[] = [
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

    let releases: MinimalSearchRelease[] = [];

    while (releases.length == 0) {
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
        releases = data.releases;

        if (releases.length == 0) {
            log.debug(
                `No results for query params: ${JSON.stringify(
                    query_params,
                )}, relaxing search...`,
            );

            // first relax by removing track count
            const track_count_index = query_params.findIndex(
                (param) => param.name === "tracks",
            );
            if (track_count_index !== -1) {
                // remove track count filter
                query_params.splice(track_count_index, 1);
                log.debug("Removed track count filter");
                continue;
            }

            // then make artist fuzzy
            const artist_param = query_params.find(
                (param) => param.name === "artist",
            );
            if (artist_param && artist_param.modifier !== "fuzzy") {
                artist_param.modifier = "fuzzy";
                log.debug("Made artist fuzzy");
                continue;
            }

            // finally make release title fuzzy
            const release_param = query_params.find(
                (param) => param.name === "release",
            );
            if (release_param && release_param.modifier !== "fuzzy") {
                release_param.modifier = "fuzzy";
                log.debug("Made release title fuzzy");
                continue;
            }

            // if still no results, remove the last query param
            query_params.pop();
            log.debug("Removed last query param to broaden search");
        } else {
            break;
        }
    }

    return releases;
}

type FilterResponse =
    | {
          status: "error";
          message: string;
      }
    | {
          status: "success";
          release_id: string;
          release_group_id: string;
          query_score: number;
          filter_store: number;
      };

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
