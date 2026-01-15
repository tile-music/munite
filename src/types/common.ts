type Recording = {
    title: string;
    duration_ms: number;
    id: string;
    first_release_date: string; // this is a yy mm dd
    track_num: number;
};

type ReleaseGroup = {
    type: string;
    release_date: string;
    title: string;
    id: string;
};

type ReleaseMetadata = {
    title: string;
    artists: string[];
    tracks: Recording[] | null;
    track_count: number;
    country: string | null;
    release_group: ReleaseGroup;
    release_date: string;
    disambiguation: string | null;
    id: string;
    cover_art: CoverArt;
    //score?: number;
};

type CoverArt = {
    front: boolean;
    darkened: boolean;
    count: number;
    artwork: boolean;
    back: boolean;
};

type ReleaseSearchMetadata = {
    stripped_album_title: string;
    url?: string;
    stripped_artists: string[];
    release_date: string | null;
    tracks: {
        name: string;
        duration_ms: number;
        url?: string;
    }[];
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

export type {
    ReleaseMetadata,
    ReleaseSearchMetadata,
    TargetMetadata,
    Recording,
    ReleaseGroup,
    CoverArt,
};
