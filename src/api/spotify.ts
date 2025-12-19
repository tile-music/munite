import { createQueue } from "../utils/queue.ts";
import * as log from "../utils/logger.ts";
import type { Queue } from "../types/queue.ts";

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
    if (Deno.env.get("SPOTIFY_ACCESS_TOKEN")) {
        access_token = Deno.env.get("SPOTIFY_ACCESS_TOKEN")!;

        // Make sure the token is still valid by making a test request
        const valid = await testAccessToken();
        if (!valid) throw new Error("Provided Spotify access token is invalid");

        return;
    }

    // Otherwise, request a new access token using client credentials
    const client_id = Deno.env.get("SPOTIFY_CLIENT_ID")!;
    const client_secret = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
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

export async function getSpotifyTrack(track_id: string): Promise<unknown> {
    const url = `https://api.spotify.com/v1/tracks/${track_id}`;
    const result = await spotify_queue!.enqueue(url, {
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    });

    if (!result.ok) {
        throw new Error(`Failed to fetch Spotify track: ${result.status}`);
    }

    return await result.json();
}

export async function getSpotifyAlbum(album_id: string): Promise<unknown> {
    const url = `https://api.spotify.com/v1/albums/${album_id}`;
    const result = await spotify_queue!.enqueue(url, {
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    });

    if (!result.ok) {
        if (result.status === 404) {
            throw new Error(`Spotify album not found: ${album_id}`);
        } else if (result.status === 400) {
            throw new Error(`Invalid Spotify album ID: ${album_id}`);
        }
        throw new Error(`Failed to fetch Spotify album: ${result.status}`);
    }

    return await result.json();
}
