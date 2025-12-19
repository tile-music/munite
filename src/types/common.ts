type ReleaseMetadata = {
    title: string;
    artists: string[];
    tracks:
        | {
              name: string;
              duration_ms: number;
          }[]
        | null;
    track_count: number;
    country: string | null;
    release_group_release_date: string | null;
    release_date: string;
    disambiguation: string | null;
};

type TargetMetadata = {
    title: string;
    artists: string[];
    tracks: {
        name: string;
        duration_ms: number;
    }[];
    release_date: string | null;
};

export type { ReleaseMetadata, TargetMetadata };
