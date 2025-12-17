import { createQueue, type Queue } from "./queue.ts";
import { ReleaseSearchMetadata } from "./validate.ts";

let music_brainz_queue: Queue | null = null;

type QueryParam = {
    name: string;
    value: string;
    modifier?: "exact" | "fuzzy";
};

type MinimalReleaseQueryResponse = {
    count: number;
    releases: MinimalRelease[];
};

type MinimalRelease = {
    id: string;
    score: number;
    title: string;
    date: string;
    "track-count": number;
    "artist-credit": {
        name: string;
    }[];
    "release-group": {
        id: string;
    };
};

function assembleMusicBrainzRequestURL(
    endpoint: string,
    query_params: QueryParam[] = [],
): string {
    // Base URL for MusicBrainz API
    const base_url = "https://musicbrainz.org/ws/2/";
    const url = new URL(endpoint, base_url);
    url.searchParams.append("fmt", "json");
    url.searchParams.append("inc", "release-groups");

    // Construct the query string
    let query = "";
    for (const param of query_params) {
        if (query.length > 0) {
            query += " AND ";
        }
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
}

export async function queryMusicBrainzRelease(
    metadata: ReleaseSearchMetadata,
): Promise<MinimalRelease[]> {
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
            name: "primarytype",
            value: "album",
        },
        {
            name: "format",
            value: "digitalmedia",
        },
        {
            name: "tracks",
            value: metadata.track_titles.length.toString(),
        },
        // {
        //   name: "country",
        //   value: "(XW || GB || US)",
        // },
    ];

    let releases: MinimalRelease[] = [];

    while (releases.length == 0) {
        const url = assembleMusicBrainzRequestURL("release/", query_params);
        console.log(url);
        const response = await music_brainz_queue.enqueue(url, {
            headers: {
                "User-Agent": "StreamBee/1.0 (mail@samranda.com)",
            },
        });

        if (!response.ok) {
            console.error(`MusicBrainz API error: ${response.status}`);
            break;
        }

        const data: MinimalReleaseQueryResponse = await response.json();
        console.log(data);
        releases = data.releases;

        if (releases.length == 0) {
            // first relax by removing track count
            const track_count_index = query_params.findIndex(
                (param) => param.name === "tracks",
            );
            if (track_count_index !== -1) {
                // remove track count filter
                query_params.splice(track_count_index, 1);
                continue;
            }

            // then make artist fuzzy
            const artist_param = query_params.find(
                (param) => param.name === "artist",
            );
            if (artist_param && artist_param.modifier !== "fuzzy") {
                artist_param.modifier = "fuzzy";
                continue;
            }

            // finally make release title fuzzy
            const release_param = query_params.find(
                (param) => param.name === "release",
            );
            if (release_param && release_param.modifier !== "fuzzy") {
                release_param.modifier = "fuzzy";
                continue;
            }

            // if still no results, remove the last query param
            query_params.pop();
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

export function filterMusicBrainzResponse(
    releases: MinimalRelease[],
): FilterResponse {
    if (releases.length === 0) {
        return {
            status: "error",
            message: "No releases found",
        };
    }

    const release = releases[0];
    return {
        status: "success",
        release_id: release.id,
        release_group_id: release["release-group"].id,
        query_score: release.score,
        filter_store: 0,
    };
}
