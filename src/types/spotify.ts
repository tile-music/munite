/**
 * Minimal type for Spotify album object.
 */
type SpotifyAlbum = {
    name: string;
    artists: { name: string }[];
    release_date?: string;
    tracks: {
        items: {
            name: string;
            duration_ms: number;
        }[];
    };
};

export type { SpotifyAlbum };
