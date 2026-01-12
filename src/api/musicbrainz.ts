import { createQueue } from "../utils/queue.ts";
import * as log from "../utils/logger.ts";
import { scoreRelease } from "../core/scorer.ts";
import type { ReleaseSearchMetadata } from "../types/common.ts";
import type { ReleaseMetadata, TargetMetadata } from "../types/common.ts";
import type { QueryParam } from "../types/musicbrainz.ts";
import type { Queue } from "../types/queue.ts";
import type {
    MinimalSearchRelease,
    MinimalRelease,
    ReleasesSearchResponse,
    FilterResponse,
    AlbumUrlsResponse,
    UrlItem
} from "../types/musicbrainz.ts";

import { assertAlbumUrlsResponse } from "../types/musicbrainz.ts";

let music_brainz_queue: Queue | null = null;


function assembleMusicBrainzRequestURL(
    endpoint: string,
    query_params: QueryParam[] = [],
): string {
    // create base url
    const base_url = Deno.env.get("MUSICBRAINZ_API_URL");
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

function escapeValue(value: string): string {
    const specialChars = /([+\-!(){}\[\]^"~*?:\\\/])/g;
    return value.replace(specialChars, "\\$1");
}

async function getReleaseByUrl(
  metadata: ReleaseSearchMetadata
): Promise<UrlItem[]> {
  if (!music_brainz_queue) {
    throw new Error("MusicBrainz queue is not initialized");
  }

  if (!(Object.hasOwn(metadata, "url") && metadata.url)) {
    throw new Error("Invalid metadata");
  }

  const mb_url = Deno.env.get("MUSICBRAINZ_API_URL");
  if (!mb_url) {
    throw new Error("MUSICBRAINZ_API_URL environment variable is not set");
  }

  const url = new URL(mb_url + "url/");
  url.searchParams.append("fmt", "json");
  url.searchParams.append("query", metadata.url);
  url.searchParams.append("limit", "3");

  const mb_response = await music_brainz_queue.enqueue(url.toString());

  const json: unknown = await mb_response.json();

  log.debug(`MusicBrainz raw response: ${JSON.stringify(json, null, 2)}`);

  assertAlbumUrlsResponse(json);

  // json is now AlbumUrlsResponse
  const filtered = json.urls.filter(
    (u) => u.resource === metadata.url
  );

  log.debug(
    `MusicBrainz filtered response: ${JSON.stringify(filtered, null, 2)}`
  );

  return filtered;
}

const removeTrackCount = (p : QueryParam[]): QueryParam[] =>
    p.filter((p) => p.name !== "tracks");

const makeArtistFuzzy = (p : QueryParam[]): QueryParam[] =>
    p.map((p) =>
        p.name === "artist" ? { ...p, modifier: "fuzzy" } : p,
    );

const makeTitleFuzzy = (p : QueryParam[]): QueryParam[] =>
    p.map((p) =>
        p.name === "release" ? { ...p, modifier: "fuzzy" } : p,
    );


function buildParamsForStage(
    base_params: QueryParam[],
    stage: number,
    pop_count: number,
    try_count: number = 1
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
    query_by_url: boolean = true
): Promise<MinimalSearchRelease[]> {
    if (!music_brainz_queue) {
        throw new Error("MusicBrainz queue is not initialized");
    }

    // if its the first time querying then check by url otherwise skip
    const release_by_url =
        query_by_url ? await getReleaseByUrl(metadata) : [];
    log.debug(`MusicBrainz release by URL: ${JSON.stringify(release_by_url, null, 2)}`);
    if (release_by_url.length > 0) {
      const releaseId =
        release_by_url
          .flatMap(u => u["relation-list"])
          .flatMap(rl => rl.relations)
          .find(r => r.release)
          ?.release!.id;

      if (!releaseId) {
        log.debug("No release found in MusicBrainz URL relations");
        return [];
      }

      const url = assembleMusicBrainzRequestURL(
        `release/${releaseId}?inc=artist-credits+release-groups`
      );

      const response = await music_brainz_queue.enqueue(url, {
        headers: {
          "User-Agent": "StreamBee/1.0 (mail@samranda.com)",
        },
      });

      const json = await response.json();
      log.debug(
        `MusicBrainz request sent for release ${JSON.stringify(json, null, 2)}`
      );

      return [json];
    }

    let prefered_region = Deno.env.get("PREFERED_REGION");
    if (!prefered_region) prefered_region = "US";

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
        const query_params = buildParamsForStage(base_params, stage, pop_count);

        if (query_params.length === 0) {
            break;
        }

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

        // Advance relaxation state (exact same order as original)
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
        release: MinimalSearchRelease;
        score: number;
    }[] = [];

    const truncated_releases = releases.slice(0, 20);
    for (const release of truncated_releases) {
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
                if (!medium.tracks) continue;
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
    if(best_release.score <= 70)
        log.info(`Release score is low:
            ${JSON.stringify(best_release, null, 2)}`);
    const release = best_release.release;

    return {
        status: "success",
        release_id: release.id,
        release_group_id: release["release-group"].id,
        query_score: release.score,
        filter_store: best_release.score,
    };
}
