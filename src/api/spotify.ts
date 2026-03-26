import { matchAlbum } from "../core/matcher.ts";
import { stripString } from "../utils/stripString.ts";

import type { Queue } from "../types/queue.ts";
import type { ReleaseSearchMetadata } from "../types/common.ts";
import type { SpotifyAlbum } from "../types/spotify.ts";
import type { FilterResponse } from "../types/musicbrainz.ts";

async function parseSpotifyAlbum(
    album: SpotifyAlbum,
): Promise<ReleaseSearchMetadata> {
    return {
        stripped_album_title: stripString(album.name),
        stripped_artists: album.artists.map((artist) =>
            stripString(artist.name),
        ),
        url: album.external_urls.spotify,
        release_date: album.release_date ?? null,
        tracks: album.tracks.items.map((track) => ({
            name: stripString(track.name),
            duration_ms: track.duration_ms,
            url: track.external_urls.spotify,
        })),
    };
}

export async function matchSpotifyAlbum(
    album: SpotifyAlbum,
): Promise<FilterResponse> {
    const metadata = await parseSpotifyAlbum(album);
    const result = await matchAlbum(metadata);
    return result;
}
