import type { AppleMusicAlbum } from "../../src/types/apple-music.ts";
import type { SpotifyAlbum } from "../../src/types/spotify.ts";

import { createQueue } from "../../src/utils/queue.ts";

const max_spotify_reqs = parseInt(
    Deno.env.get("MAX_SPOTIFY_REQUESTS_PER_SECOND") || "100",
);
const max_am_reqs = parseInt(
    Deno.env.get("MAX_APPLE_MUSIC_REQUESTS_PER_SECOND") || "100",
);

export const spotifyQueue = createQueue();
export const appleMusicQueue = createQueue();

setInterval(() => spotifyQueue.process(), 1000 / max_spotify_reqs);

setInterval(() => appleMusicQueue.process(), 1000 / max_am_reqs);

export async function fetchAppleAlbum(
    album_id: string,
    developer_token: string,
    storefront: string,
): Promise<AppleMusicAlbum> {
    const url = `https://api.music.apple.com/v1/catalog/${storefront}/albums/${album_id}`;

    const res = await appleMusicQueue.enqueue(url, {
        headers: { Authorization: `Bearer ${developer_token}` },
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

    if (!json.data?.length) {
        throw new Error(`Apple Music returned empty album data: ${album_id}`);
    }

    // Return raw album object unchanged
    return json.data[0] as AppleMusicAlbum;
}

let cachedSpotifyToken: {
    token: string;
    expires_at: number;
} | null = null;

async function getSpotifyAccessToken(
    client_id: string,
    client_secret: string,
): Promise<string> {
    const now = Date.now();

    if (cachedSpotifyToken && cachedSpotifyToken.expires_at > now) {
        return cachedSpotifyToken.token;
    }

    const credentials = btoa(`${client_id}:${client_secret}`);

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${credentials}`,
        },
        body: "grant_type=client_credentials",
    });

    if (!res.ok) {
        throw new Error(`Failed to obtain Spotify access token: ${res.status}`);
    }

    const json = await res.json();

    if (!json.access_token) {
        throw new Error("Spotify token response missing access_token");
    }

    const expires_in = json.expires_in as number;

    cachedSpotifyToken = {
        token: json.access_token,
        expires_at: now + expires_in * 1000 - 10_000, // safety buffer
    };

    return cachedSpotifyToken.token;
}

export async function fetchSpotifyAlbum(
    album_id: string,
): Promise<SpotifyAlbum> {
    const client_id = Deno.env.get("SPOTIFY_CLIENT_ID")!;
    const client_secret = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;

    if (!client_id || !client_secret) {
        throw new Error(
            "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required",
        );
    }

    const access_token = await getSpotifyAccessToken(client_id, client_secret);

    const album_url = `https://api.spotify.com/v1/albums/${album_id}`;

    const album_res = await spotifyQueue.enqueue(album_url, {
        headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!album_res.ok) {
        if (album_res.status === 404) {
            throw new Error(`Spotify album not found: ${album_id}`);
        }
        if (album_res.status === 400) {
            throw new Error(`Invalid Spotify album ID: ${album_id}`);
        }
        throw new Error(`Failed to fetch Spotify album: ${album_res.status}`);
    }

    const spotify_album: SpotifyAlbum = await album_res.json();

    // 🔁 FULL TRACK PAGINATION
    const allTracks: SpotifyAlbum["tracks"]["items"] = [];
    let url: string | null = spotify_album.tracks.href;

    while (url) {
        const res = await spotifyQueue.enqueue(url, {
            headers: { Authorization: `Bearer ${access_token}` },
        });

        if (!res.ok) {
            throw new Error(
                `Spotify error ${res.status} while fetching album tracks: ${album_id}`,
            );
        }

        const page: SpotifyAlbum["tracks"] = await res.json();

        allTracks.push(...page.items);
        url = page.next;
    }

    // Preserve original album shape
    spotify_album.tracks.items = allTracks;
    spotify_album.tracks.next = null;

    return spotify_album;
}
