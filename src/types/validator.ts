/**
 * Release search metadata, used for searching releases in MusicBrainz.
 */
type ReleaseSearchMetadata = {
    stripped_album_title: string;
    stripped_artists: string[];
    release_date: string | null;
    tracks: {
        name: string;
        duration_ms: number;
    }[];
};

export type { ReleaseSearchMetadata };
