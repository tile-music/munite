import { createQueue } from "../utils/queue.ts";
import * as log from "../utils/logger.ts";
import { matchAlbum } from "../core/matcher.ts";

import type { Queue } from "../types/queue.ts";
import type {
    ReleaseSearchMetadata } from "../types/common.ts";
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


async function getSpotifyAlbum(
  album_id: string,
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

  const spotify_album: SpotifyAlbum = await album_res.json();

  /* paginate using tracks.href! */
  const tracks: SpotifyAlbum["tracks"]["items"] = [];
  let url: string | null = spotify_album.tracks.href;

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
    stripped_album_title: stripString(spotify_album.name),
    stripped_artists: spotify_album.artists.map((artist) =>
      stripString(artist.name),
    ),
    url: spotify_album.external_urls.spotify,
    release_date: spotify_album.release_date ?? null,
    tracks: tracks.map((track) => ({
      name: stripString(track.name),
      duration_ms: track.duration_ms,
      url: track.external_urls.spotify,
    })),
  };
}


/**
 * Strips and normalizes a string by:
 * - Converting to lowercase
 * - Replacing multiple spaces with a single space
 * - Normalizing to decompose combined characters
 * - Removing diacritics
 * - Trimming leading and trailing whitespace
 * - Remove (Remastered), (Remaster), [Remastered], and [Remaster]
 *
 * @param input - The input string to be stripped and normalized.
 * @returns The stripped and normalized string.
 */
function stripString(input: string): string {
    return input
        .toLowerCase() // Make lowercase
        .replace(/\s+/g, " ") // Replace multiple spaces with a single space
        .normalize("NFD") // Normalize to decompose combined characters
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
        .replace(/\(remaster(ed)?\)|\[remaster(ed)?\]/g, "") // Remove (Remastered), (Remaster), [Remastered], [Remaster]
        .trim(); // Trim leading and trailing whitespace
}

export async function matchSpotifyAlbum(
    album_id: string
): Promise<FilterResponse> {
    const metadata = await getSpotifyAlbum(album_id);
    const result = await matchAlbum(metadata);
    return result;
}
