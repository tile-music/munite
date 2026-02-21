import { FilterResponse } from "../types/musicbrainz.ts";

type SpotifyMetadata = any;
type AppleMusicMetadata = any;

async function matchAlbum(
    service: "spotify",
    id: string,
    metadata?: SpotifyMetadata,
): Promise<FilterResponse>;
async function matchAlbum(
    service: "apple-music",
    id: string,
    metadata?: AppleMusicMetadata,
): Promise<FilterResponse>;
async function matchAlbum(
    service: string,
    id: string,
    metadata?: unknown,
): Promise<FilterResponse> {

}


export { matchAlbum };
