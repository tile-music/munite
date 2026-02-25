import type { FilterResponse } from "../types/musicbrainz.ts";
import type { SpotifyAlbum } from "../types/spotify.ts";
import type { AppleMusicAlbum } from "../types/apple-music.ts";

import { matchSpotifyAlbum } from "./spotify.ts";
import { matchAppleMusicAlbum } from "./apple-music.ts";

async function matchAlbum(
    service: "spotify",
    metadata: SpotifyAlbum,
): Promise<FilterResponse>;
async function matchAlbum(
    service: "apple-music",
    metadata: AppleMusicAlbum,
): Promise<FilterResponse>;
async function matchAlbum(
    service: string,
    metadata: unknown,
): Promise<FilterResponse> {
    switch (service) {
        case "spotify":
            return await matchSpotifyAlbum(metadata as SpotifyAlbum);
        case "apple-music":
            return await matchAppleMusicAlbum(metadata as AppleMusicAlbum);
        default:
            throw new Error(`Unsupported service: ${service}`);
    }
}

export { matchAlbum };
