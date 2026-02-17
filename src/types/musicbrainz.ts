import * as log from "../utils/logger.ts"

import type { Recording, ReleaseMetadata, CoverArt } from "../types/common.ts";

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

export type TrackRecording = {
    id: string;
    title: string;
    disambiguation: string;
    "first-release-date": string;
    length: number;
    video: boolean;
};

export type Track = {
    id: string;
    number: string; // note: this is a string in the data ("12")
    title: string;
    position: number;
    length: number;
    recording: TrackRecording;
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
        tracks?: Track[];
    }[];
    "cover-art-archive": CoverArt;
};

type FilterResponse =
    | {
          status: "error";
          message: string;
      }
    | {
          status: "success";
          release: ReleaseMetadata;
          //release_group: ReleaseGroup;
          //query_score: number;
          filter_score: number;
      };

/* =========================
 * Types (exact API shape)
 * ========================= */

type UrlLookupResponse = {
    id: string;
    resource: string;
    relations?: Relation[];
};

type Relation = {
    type: string;
    "type-id": string;
    direction: string;
    "target-type": string;
    ended: boolean;
    release?: RelationRelease;
};

type RelationRelease = {
    id: string;
    title: string;
    date?: string;
    country?: string;
};

type MusicBrainzErrorResponse = {
    error: string;
    help?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

/* =========================
 * Assertion functions
 * ========================= */

export function assertRelationRelease(
    value: unknown,
): asserts value is RelationRelease {
    assert(isObject(value), "RelationRelease must be an object");

    assert(typeof value.id === "string", "Release.id must be a string");
    assert(typeof value.title === "string", "Release.title must be a string");

    if (value.date !== undefined) {
        assert(typeof value.date === "string", "Release.date must be a string");
    }

    if (value.country !== undefined) {
        log.debug(`Release.country: ${value.country}\n
                    ${JSON.stringify(value, null, 2)}`);

        assert(
            typeof value.country === "string" ||
            value.country === null,
            "Release.country must be a string or null",
        );

    }
}

export function assertRelation(value: unknown): asserts value is Relation {
    assert(isObject(value), "Relation must be an object");

    assert(typeof value.type === "string", "Relation.type must be a string");
    assert(
        typeof value["type-id"] === "string",
        "Relation.type-id must be a string",
    );
    assert(
        typeof value.direction === "string",
        "Relation.direction must be a string",
    );
    assert(
        typeof value["target-type"] === "string",
        "Relation.target-type must be a string",
    );
    assert(
        typeof value.ended === "boolean",
        "Relation.ended must be a boolean",
    );

    if (value.release !== undefined) {
        assertRelationRelease(value.release);
    }
}
// export function assertRelationListItem(
//     value: unknown,
// ): asserts value is RelationListItem {
//     assert(isObject(value), "RelationListItem must be an object");
//     assert(Array.isArray(value.relations), "relations must be an array");

//     for (const relation of value.relations) {
//         assertRelation(relation);
//     }
// }

// export function assertUrlItem(value: unknown): asserts value is UrlItem {
//     assert(isObject(value), "UrlItem must be an object");

//     assert(typeof value.id === "string", "UrlItem.id must be a string");
//     assert(typeof value.score === "number", "UrlItem.score must be a number");
//     assert(
//         typeof value.resource === "string",
//         "UrlItem.resource must be a string",
//     );

//     log.debug(`UrlItem: ${JSON.stringify(value, null, 2)}`);

//     log.debug(`UrlItem.relation-list: ${value["relation-list"]}`);

//     assert(
//         Array.isArray(value["relation-list"]),
//         "UrlItem.relation-list must be an array",
//     );

//     for (const item of value["relation-list"]) {
//         assertRelationListItem(item);
//     }
// }

// export function assertAlbumUrlsResponse(
//     value: unknown,
// ): asserts value is AlbumUrlsResponse {
//     assert(isObject(value), "AlbumUrlsResponse must be an object");

//     assert(typeof value.created === "string", "created must be a string");
//     assert(typeof value.count === "number", "count must be a number");
//     assert(typeof value.offset === "number", "offset must be a number");

//     assert(Array.isArray(value.urls), "urls must be an array");
//     for (const url of value.urls) {
//         assertUrlItem(url);
//     }
// }

export function assertUrlLookupResponse(
    value: unknown,
): asserts value is UrlLookupResponse {
    assert(isObject(value), "UrlLookupResponse must be an object");

    assert(typeof value.id === "string", "id must be a string");
    assert(typeof value.resource === "string", "resource must be a string");

    if (value.relations !== undefined) {
        assert(Array.isArray(value.relations), "relations must be an array");

        for (const rel of value.relations) {
            assertRelation(rel);
        }
    }
}

export function isMusicBrainzErrorResponse(
    value: unknown,
): value is MusicBrainzErrorResponse {
    return (
        isObject(value) &&
        typeof value.error === "string"
    );
}

export type {
    QueryParam,
    ReleasesSearchResponse,
    MinimalSearchRelease,
    MinimalRelease,
    FilterResponse,
    UrlLookupResponse,
    Recording,
    CoverArt,
};
