type Artwork = {
    width: number;
    height: number;
    url: string;
    bgColor?: string;
    textColor1?: string;
    textColor2?: string;
    textColor3?: string;
    textColor4?: string;
};

type Preview = {
    url: string;
};

type PlayParams = {
    id: string;
    kind: string;
};

type SongAttributes = {
    albumName?: string;
    genreNames?: string[];
    trackNumber?: number;
    durationInMillis?: number;
    releaseDate?: string;
    isrc?: string;
    artwork?: Artwork;
    composerName?: string;
    url?: string;
    playParams?: PlayParams;
    discNumber?: number;
    hasLyrics?: boolean;
    isAppleDigitalMaster?: boolean;
    name: string;
    previews?: Preview[];
    artistName?: string;
};

export type AppleMusicSong = {
    id: string;
    type: "songs";
    href: string;
    attributes: SongAttributes;
};

export type AppleMusicRecentlyPlayedResponse = {
    data: AppleMusicSong[];
    href?: string;
    next?: string;
    meta?: Record<string, unknown>;
};

type EditorialNotes = {
    short?: string;
    standard?: string;
};

type ResourceId = {
    id: string;
    type: string;
    href?: string;
};

type Relationship<T> = {
    href?: string;
    next?: string;
    data?: T[];
};

type AlbumAttributes = {
    artistName?: string;
    name: string;
    url?: string;
    genreNames?: string[];
    releaseDate?: string;
    trackCount?: number;
    isCompilation?: boolean;
    isSingle?: boolean;
    isMasteredForItunes?: boolean;
    upc?: string;
    copyright?: string;
    recordLabel?: string;
    editorialNotes?: EditorialNotes;
    artwork?: Artwork;
};

export type AppleMusicAlbum = {
    id: string;
    type: "albums";
    href: string;
    attributes: AlbumAttributes;
    relationships?: {
        artists?: Relationship<ResourceId>;
        tracks?: Relationship<AppleMusicSong>;
    };
};

export type AppleMusicAlbumResponse = {
    data: AppleMusicAlbum[];
    href?: string;
    next?: string;
    meta?: Record<string, unknown>;
};
