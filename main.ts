import { load } from "@std/dotenv";
import { getSpotifyAlbum, initializeSpotifyQueue } from "./spotify.ts";
import { initializeMusicBrainzQueue } from "./mb.ts";
import { prepareReleaseSearchMetadata } from "./validate.ts";
import { filterMusicBrainzResponse, queryMusicBrainzRelease } from "./mb.ts";
await load({ export: true });

function verifyEnvironmentVariables() {
    const requiredVars = [
        "MUSICBRAINZ_API_URL",
        "MAX_MUSICBRAINZ_REQUESTS_PER_SECOND",
        "SPOTIFY_CLIENT_ID",
        "SPOTIFY_CLIENT_SECRET",
        "MAX_SPOTIFY_REQUESTS_PER_SECOND",
    ];

    for (const varName of requiredVars) {
        if (!Deno.env.get(varName)) {
            throw new Error(`Environment variable ${varName} is not set.`);
        }
    }
}

export async function init() {
    verifyEnvironmentVariables();

    initializeMusicBrainzQueue(
        Number(Deno.env.get("MAX_MUSICBRAINZ_REQUESTS_PER_SECOND")),
    );
    await initializeSpotifyQueue(
        Number(Deno.env.get("MAX_SPOTIFY_REQUESTS_PER_SECOND")),
    );
}

if (import.meta.main) {
    await init();

    const album_id = Deno.args[0];
    if (!album_id) {
        console.error("Please provide a Spotify album ID as an argument.");
        Deno.exit(1);
    }

    await spotifyAlbumToMusicBrainz(album_id);
}

export async function spotifyAlbumToMusicBrainz(album_id: string) {
    const album = await getSpotifyAlbum(album_id);
    const metadata = prepareReleaseSearchMetadata(album);
    const response = await queryMusicBrainzRelease(metadata);
    const id = filterMusicBrainzResponse(response);
    return id;
}
