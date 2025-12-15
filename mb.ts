import { createQueue, type Queue } from "./queue.ts";
import { ReleaseSearchMetadata } from "./validate.ts";

let music_brainz_queue: Queue | null = null;

type QueryParam = {
    name: string;
    value: string;
    exact?: boolean;
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
        query += `${param.name}:${
            param.exact ? `"${escaped_value}"` : escaped_value
        }`;
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
): Promise<Response> {
    if (!music_brainz_queue) {
        throw new Error("MusicBrainz queue is not initialized");
    }

    const query_params: QueryParam[] = [
        {
            name: "artist",
            value: metadata.stripped_artists.join(" ") + "~",
        },
        {
            name: "release",
            value: metadata.stripped_album_title + "~",
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

    const url = assembleMusicBrainzRequestURL("release/", query_params);
    const response = await music_brainz_queue.enqueue(url, {
        headers: {
            "User-Agent": "StreamBee/1.0 (mail@samranda.com)",
        },
    });

    return response;
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
    response: Response,
): Promise<FilterResponse> {
    if (!response.ok) {
        console.error(`MusicBrainz API error: ${response.status}`);
        return {
            status: "error",
            message: `MusicBrainz API error: ${response.status}`,
        };
    }

    const data = await response.json();
    if (data.count === 0) {
        return {
            status: "error",
            message: "No releases found",
        };
    }

    const release = data.releases[0];
    return {
        status: "success",
        release_id: release.id,
        release_group_id: release["release-group"].id,
        query_score: release.score,
        filter_store: 0,
    };
}
