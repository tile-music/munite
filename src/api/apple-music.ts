import { matchAlbum } from "../core/matcher.ts";

import { stripString } from "../utils/stripString.ts";

import type { ReleaseSearchMetadata } from "../types/common.ts";
import type { FilterResponse } from "../types/musicbrainz.ts";
import type { AppleMusicAlbum } from "../types/apple-music.ts";

/* =========================
   Apple Music Album Fetch
========================= */

function parseAppleMusicRequest(
   album: AppleMusicAlbum
): ReleaseSearchMetadata {
    const attrs = album.attributes;

    const tracks: ReleaseSearchMetadata["tracks"] = [];
    if (!album.relationships || !album.relationships.tracks)
        throw new Error(`Apple Music album missing tracks ${JSON.stringify(album, null, 2)}`);
    const trackData = album.relationships.tracks;


    const normalizeAppleMusicAlbumUrl = (url: string): string =>
        url.replace(
            /^(https:\/\/music\.apple\.com\/[^/]+\/(album|song))\/[^/]+\/(\d+)$/,
            "$1/$3",
        );

    for (const track of trackData?.data ?? []) {
        tracks.push({
            name: stripString(track.attributes.name),
            duration_ms: Number(track.attributes.durationInMillis),
            url: normalizeAppleMusicAlbumUrl(track.attributes.url ?? ""),
        });
    }
    return {
        stripped_album_title: stripString(attrs.name),
        stripped_artists: [stripString(attrs.artistName ?? "")],
        url: normalizeAppleMusicAlbumUrl(attrs.url ?? ""),
        release_date: attrs.releaseDate ?? null,
        tracks,
    };

}

/* =========================
   Matching Entry Point
========================= */

export async function matchAppleMusicAlbum(
    album: AppleMusicAlbum,
): Promise<FilterResponse> {
    const metadata = parseAppleMusicRequest(album);
    return await matchAlbum(metadata);
}
