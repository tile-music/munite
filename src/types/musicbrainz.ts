type QueryParam = {
    name: string;
    value: string;
    modifier?: "exact" | "fuzzy";
};

type ReleasesSearchResponse = {
    count: number;
    releases: MinimalSearchRelease[];
};

type MinimalSearchRelease = {
    id: string;
    score: number;
    title: string;
    date: string;
    country: string | null;
    disambiguation: string | null;
    "track-count": number;
    "artist-credit": {
        name: string;
    }[];
    "release-group": {
        id: string;
    };
};

type MinimalRelease = {
    "release-group": {
        id: string;
        title: string;
        disambiguation: string;
        "primary-type": string;
        "secondary-types": string[];
        "first-release-date": string;
    };
    media: {
        tracks: {
            title: string;
            length: number;
        }[];
    }[];
};

type FilterResponse =
    | {
          status: "error";
          message: string;
      }
    | {
          status: "success";
          release_id: string;
          release_group_id: string;
          query_score: number;
          filter_store: number;
      };

export type {
    QueryParam,
    ReleasesSearchResponse,
    MinimalSearchRelease,
    MinimalRelease,
    FilterResponse,
};
