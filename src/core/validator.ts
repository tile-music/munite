import type { ReleaseSearchMetadata } from "../types/validator.ts";

/**
 * Prepares release search metadata from the given album data.
 * @param album - The album data object.
 * @returns An object containing stripped album title, stripped artists, and track titles.
 * @throws Will throw an error if the album data is invalid or missing required fields.
 */
export function prepareReleaseSearchMetadata(
    album: unknown,
): ReleaseSearchMetadata {
    if (typeof album !== "object" || album === null) {
        throw new Error("Invalid album data");
    }

    if (!("name" in album) || typeof album["name"] !== "string") {
        throw new Error("Album name is missing or invalid");
    }
    const album_title = album["name"] as string;

    if (!("artists" in album) || !Array.isArray(album["artists"])) {
        throw new Error("Album artists are missing or invalid");
    }
    const artists = (album["artists"] as Array<unknown>).map((artist) => {
        if (typeof artist !== "object" || artist === null) {
            throw new Error("Artist data is invalid");
        }
        if (!("name" in artist) || typeof artist["name"] !== "string") {
            throw new Error("Artist name is missing or invalid");
        }

        return artist["name"] as string;
    });

    const release_date =
        "release_date" in album && typeof album["release_date"] === "string"
            ? (album["release_date"] as string)
            : null;

    if (
        !("tracks" in album) ||
        typeof album["tracks"] !== "object" ||
        album["tracks"] === null
    ) {
        throw new Error("Album tracks are missing or invalid");
    }
    if (
        !("items" in album["tracks"]) ||
        !Array.isArray(album["tracks"]["items"])
    ) {
        throw new Error("Album track items are missing or invalid");
    }

    const tracks = (album["tracks"]["items"] as Array<unknown>).map((track) => {
        if (typeof track !== "object" || track === null) {
            throw new Error("Track data is invalid");
        }

        if (!("name" in track) || typeof track["name"] !== "string") {
            throw new Error("Track name is missing or invalid");
        }

        if (
            !("duration_ms" in track) ||
            typeof track["duration_ms"] !== "number"
        ) {
            throw new Error("Track duration is missing or invalid");
        }

        return {
            name: track["name"] as string,
            duration_ms: track["duration_ms"] as number,
        };
    });

    return {
        stripped_album_title: stripString(album_title),
        stripped_artists: artists.map(stripString),
        release_date: release_date,
        tracks: tracks.map((t) => {
            return {
                name: stripString(t.name),
                duration_ms: t.duration_ms,
            };
        }),
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
