import type { FilterResponse } from "../types/musicbrainz.ts";
import type { AppleMusicAlbum } from "../types/apple-music.ts";
import {log} from "../utils/logger.ts"


type SpotifyMetadata = any;


async function matchAlbum(
    service: "spotify",
    id: string,
    metadata?: SpotifyMetadata,
): Promise<FilterResponse>;
async function matchAlbum(
    service: "apple-music",
    id: string,
    metadata?: AppleMusicAlbum,
): Promise<FilterResponse>;
async function matchAlbum(
    service: string,
    id: string,
    metadata?: unknown,
): Promise<FilterResponse> {
    switch (service) {
        case "spotify":


    }

}


export { matchAlbum };
