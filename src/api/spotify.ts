import { createQueue } from "../utils/queue.ts";
import * as log from "../utils/logger.ts";
import { matchAlbum } from "../core/matcher.ts";
import { getConfig } from "../core/config.ts";
import { stripString } from "../utils/stripString.ts";

import type { Queue } from "../types/queue.ts";
import type { ReleaseSearchMetadata } from "../types/common.ts";
import type { SpotifyAlbum } from "../types/spotify.ts";
import type { FilterResponse } from "../types/musicbrainz.ts";

let spotify_queue: Queue | null = null;
let access_token: string | null = null;

export async function initializeSpotifyQueue(req_per_sec: number) {
    if (spotify_queue) return;

    spotify_queue = createQueue();

    const spotify_interval = 1000 / req_per_sec;
    setInterval(spotify_queue!.process, spotify_interval);

    await requestAccessToken();
}

async function requestAccessToken() {
    // If we already have a valid access token, do nothing
    if (access_token) return;

    // Check if a valid access token was supplied via environment variable
    const config = getConfig();
    if (config.spotify_access_token) {
        access_token = config.spotify_access_token;

        // Make sure the token is still valid by making a test request
        const valid = await testAccessToken();
        if (!valid) throw new Error("Provided Spotify access token is invalid");

        return;
    }

    // Otherwise, request a new access token using client credentials
    const client_id = config.spotify_client_id;
    const client_secret = config.spotify_client_secret;
    const credentials = btoa(`${client_id}:${client_secret}`);

    const result = await spotify_queue!.enqueue(
        "https://accounts.spotify.com/api/token",
        {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
        },
    );

    if (!result.ok) {
        throw new Error(
            `Failed to obtain Spotify access token: ${result.status}`,
        );
    }

    const data = await result.json();
    access_token = data.access_token;
    log.debug(access_token ?? "No access token obtained");
    setTimeout(requestAccessToken, (data.expires_in - 60) * 1000);
}

async function testAccessToken() {
    const url = `https://api.spotify.com/v1/albums/3u20OXh03DjCUzbf8XcGTq`; // Example album ID
    const result = await spotify_queue!.enqueue(url, {
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    });

    if (result.status === 401) {
        access_token = null;
        return false;
    }

    return true;
}

async function getSpotifyAlbum(
    album: SpotifyAlbum,
): Promise<ReleaseSearchMetadata> {
    const album_url = `https://api.spotify.com/v1/albums/${album_id}`;

    const album_res = await spotify_queue!.enqueue(album_url, {
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    });

    if (!album_res.ok) {
        if (album_res.status === 404) {
            throw new Error(`Spotify album not found: ${album_id}`);
        } else if (album_res.status === 400) {
            throw new Error(`Invalid Spotify album ID: ${album_id}`);
        }
        throw new Error(`Failed to fetch Spotify album: ${album_res.status}`);
    }


    /* paginate using tracks.href! */

    let url: string | null = album.tracks.href;
    while (url) {
        const res = await spotify_queue!.enqueue(url, {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        if (!res.ok) {
            throw new Error(
                `Spotify error ${res.status} while fetching album tracks: ${album_id}`,
            );
        }

        const page: SpotifyAlbum["tracks"] = await res.json();

        tracks.push(...page.items);
        url = page.next;
    }

    return {
        stripped_album_title: stripString(album.name),
        stripped_artists: album.artists.map((artist) =>
            stripString(artist.name),
        ),
        url: album.external_urls.spotify,
        release_date: album.release_date ?? null,
        tracks: album.tracks.map((track) => ({
            name: stripString(track.name),
            duration_ms: track.duration_ms,
            url: track.external_urls.spotify,
        })),
    };
}

export async function matchSpotifyAlbum(
    album_id: string,
): Promise<FilterResponse> {
    const metadata = await getSpotifyAlbum(album_id);
    const result = await matchAlbum(metadata);
    return result;
}
