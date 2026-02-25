import { createQueue } from "../utils/queue.ts";
import * as log from "../utils/logger.ts";
import { matchAlbum } from "../core/matcher.ts";
import { getConfig } from "../core/config.ts";

import { stripString } from "../utils/stripString.ts";

import type { ReleaseSearchMetadata } from "../types/common.ts";
import type { FilterResponse } from "../types/musicbrainz.ts";
import type { AppleMusicAlbum } from "../types/apple-music.ts";

/* =========================
   Apple Music Album Fetch
========================= */

async function parseAppleMusicRequest(
   album: AppleMusicAlbum
): Promise<ReleaseSearchMetadata> {
    const attrs = album.attributes;

    const tracks: ReleaseSearchMetadata["tracks"] = [];
    if (!album.relationships || !album.relationships.tracks)
        throw new Error("Apple Music album missing tracks");
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
    const metadata = await parseAppleMusicRequest(album);
    return matchAlbum(metadata);
}
