/**
 * Minimal type for Spotify album object.
 */
type SpotifyTrack = SpotifyBase & {
  name: string;
  duration_ms: number;
};

type SpotifyTrackPage = {
  items: SpotifyTrack[];
  next: string | null;
};

type SpotifyAlbum = SpotifyBase & {
  name: string;
  release_date?: string;
  artists: { name: string }[];
  tracks: SpotifyTrackPage & {
    href: string;
  };
};

type SpotifyBase = {
    external_urls: {
        spotify: string;
    }
};

export type { SpotifyAlbum };
