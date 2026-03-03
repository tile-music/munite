import type { FilterResponse } from "../types/musicbrainz.ts";
import type { SpotifyAlbum } from "../types/spotify.ts";
import type { AppleMusicAlbum } from "../types/apple-music.ts";

import { matchSpotifyAlbum } from "./spotify.ts";
import { matchAppleMusicAlbum } from "./apple-music.ts";

const matchers = {
    spotify: matchSpotifyAlbum,
    "apple-music": matchAppleMusicAlbum,
};

type ServiceMap = {
    spotify: SpotifyAlbum;
    "apple-music": AppleMusicAlbum;
};

async function matchAlbum<T extends keyof ServiceMap>(
    service: T,
    metadata: ServiceMap[T],
): Promise<FilterResponse> {
    return await matchers[service](metadata as never);
}

export { matchAlbum };
