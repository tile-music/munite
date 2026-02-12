import { createQueue } from "../utils/queue.ts";
import * as log from "../utils/logger.ts";
import { matchAlbum } from "../core/matcher.ts";
import { getConfig } from "../core/config.ts";

import { stripString } from "../utils/stripString.ts";

import type { Queue } from "../types/queue.ts";
import type { ReleaseSearchMetadata } from "../types/common.ts";
import type { FilterResponse } from "../types/musicbrainz.ts";

/* =========================
   Module State
========================= */

let apple_queue: Queue | null = null;
let developer_token: string | null = null;
let storefront: string | null = null;

/* =========================
   Initialization
========================= */

export async function initializeAppleMusicQueue(req_per_sec: number) {
    if (apple_queue) return;

    apple_queue = createQueue();
    const interval = 1000 / req_per_sec;
    setInterval(apple_queue.process, interval);

    loadAppleMusicConfig();
}

function loadAppleMusicConfig() {
    const config = getConfig();

    if (!config.apple_music_developer_token) {
        throw new Error("Apple Music developer token missing");
    }

    developer_token = config.apple_music_developer_token;
    storefront = config.apple_music_storefront ?? "us";

    log.debug("Apple Music configuration loaded");
}

/* =========================
   Apple Music Album Fetch
========================= */

async function getAppleMusicAlbum(
    album_id: string,
): Promise<ReleaseSearchMetadata> {
    const url = `https://api.music.apple.com/v1/catalog/${storefront}/albums/${album_id}`;

    const res = await apple_queue!.enqueue(url, {
        headers: {
            Authorization: `Bearer ${developer_token}`,
        },
    });

    if (!res.ok) {
        if (res.status === 404) {
            throw new Error(`Apple Music album not found: ${album_id}`);
        } else if (res.status === 400) {
            throw new Error(`Invalid Apple Music album ID: ${album_id}`);
        }
        throw new Error(`Failed to fetch Apple Music album: ${res.status}`);
    }

    const json = await res.json();
    const album = json.data[0];
    const attrs = album.attributes;

    const tracks: ReleaseSearchMetadata["tracks"] = [];

    const trackData = album.relationships.tracks;
    let next: string | null = trackData?.next ?? null;

    for (const track of trackData?.data ?? []) {
        tracks.push({
            name: stripString(track.attributes.name),
            duration_ms: track.attributes.durationInMillis,
            url: track.attributes.url ?? null,
        });
    }

    while (next) {
        const pageRes = await apple_queue!.enqueue(
            `https://api.music.apple.com${next}`,
            {
                headers: {
                    Authorization: `Bearer ${developer_token}`,
                },
            },
        );

        if (!pageRes.ok) {
            throw new Error(
                `Apple Music error ${pageRes.status} while fetching tracks: ${album_id}`,
            );
        }

        const page = await pageRes.json();
        const rel = page.data;

        for (const track of rel) {
            tracks.push({
                name: stripString(track.attributes.name),
                duration_ms: track.attributes.durationInMillis,
                url: track.attributes.url ?? null,
            });
        }

        next = page.next ?? null;
    }

    return {
        stripped_album_title: stripString(attrs.name),
        stripped_artists: [stripString(attrs.artistName)],
        url: attrs.url ?? undefined,
        release_date: attrs.releaseDate ?? null,
        tracks
    };
}

/* =========================
   Matching Entry Point
========================= */

export async function matchAppleMusicAlbum(
    album_id: string,
): Promise<FilterResponse> {
    const metadata = await getAppleMusicAlbum(album_id);
    return matchAlbum(metadata);
}
