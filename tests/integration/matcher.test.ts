import { assertGreaterOrEqual } from "@std/assert";
import { init, matchAlbum, LogLevel } from "../../src/mod.ts";
import { fetchSpotifyAlbum, fetchAppleAlbum } from "../fixtures/helpers.ts";
import albumsJson from "../fixtures/albums.json" with { type: "json" };
const albums = albumsJson as unknown as Tests;

import * as log from "../../src/mod.ts";

const EXPECTED_SUCCESS_RATE = 0.9;

type Tests = {
    albums: Test[];
    deluxe_albums: Test[];
    singles: Test[];
    eps: Test[];
};

type Test = {
    song_name: string;
    release_group: string;
    apple: SourceRelease;
    spotify: SourceRelease;
};
type SourceRelease = {
    id: string;
    release: string | string[];
};
type Failure = {
    test: Test;
    source: Source;
    actual: string;
};
type Source = "spotify" | "apple";

Deno.test.beforeAll(async () => {
    const config = {
        musicbrainz_api_url: Deno.env.get("MUSICBRAINZ_API_URL")!,
        max_musicbrainz_requests_per_second: Number(
            Deno.env.get("MAX_MUSICBRAINZ_REQUESTS_PER_SECOND") ?? 1,
        ),

        spotify_client_id: Deno.env.get("SPOTIFY_CLIENT_ID") ?? "",
        spotify_client_secret: Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "",
        max_spotify_requests_per_second: Number(
            Deno.env.get("MAX_SPOTIFY_REQUESTS_PER_SECOND") ?? 10,
        ),

        query_release: Deno.env.get("QUERY_RELEASE") ?? "true",
        log_level: Deno.env.get("LOG_LEVEL") as LogLevel | undefined,
        preferred_region: Deno.env.get("PREFERED_REGION") ?? "US",
        apple_music_developer_token: Deno.env.get("APPLE_MUSIC_DEV_TOKEN")!,
        apple_music_storefront: Deno.env.get("PREFERED_REGION") ?? "US", // e.g. "us"
    };

    await init(config);
});

for (const [category, category_tests] of Object.entries(albums)) {
    //for (const source of ["spotify", "apple"] as const) {
    for (const source of ["apple", "spotify"] as const) {
        Deno.test(
            `${source} Album to MusicBrainz ID - ${category}`,
            async () => {
                const testsForSource = category_tests.filter(
                    (test) => test[source].id.trim() !== "",
                );

                if (testsForSource.length === 0) {
                    log.info(`SKIP [0/0]: no ${source} IDs in ${category}`);
                    return;
                }

                const num_tests = testsForSource.length;
                const failures: Failure[] = [];
                let successes = 0;

                // Run all tests concurrently
                const results = await Promise.all(
                    testsForSource.map(async (test) => {
                        const id = test[source].id;
                        const expected_musicbrainz_release_group_id =
                            test.release_group;
                        const expected_musicbrainz_id = test[source].release;
                        //this is where metadata needs to be fetched depending on service
                        let musicbrainz_result;
                        if (source === "apple") {
                            const metadata = await fetchAppleAlbum(
                                id,
                                Deno.env.get("APPLE_MUSIC_DEV_TOKEN")!,
                                Deno.env.get("PREFERED_REGION") ?? "US",
                            );
                            musicbrainz_result = await matchAlbum("apple-music", metadata);
                        } else {
                            const metadata = await fetchSpotifyAlbum(id);
                            musicbrainz_result = await matchAlbum("spotify", metadata);
                        }
                        let status;
                        let success = 0;
                        let failure: Failure | null = null;

                        if (musicbrainz_result.status != "success") {
                            failure = {
                                source,
                                test,
                                actual: musicbrainz_result.message,
                            };
                            status = "FAILED!";
                        } else {
                            const actual = musicbrainz_result.release.id;
                            if (
                                (typeof expected_musicbrainz_id != "string" &&
                                    !expected_musicbrainz_id.includes(
                                        actual,
                                    )) ||
                                (typeof expected_musicbrainz_id == "string" &&
                                    actual !== expected_musicbrainz_id)
                            ) {
                                if (
                                    musicbrainz_result.release.release_group
                                        .id ===
                                    expected_musicbrainz_release_group_id
                                ) {
                                    success = 0.5;
                                    status = "PARTIAL";
                                } else {
                                    status = "FAILED!";
                                }
                                failure = { source, test, actual };
                            } else {
                                success = 1;
                                status = "SUCCESS";
                            }
                        }

                        return {
                            status,
                            song_name: test.song_name,
                            success,
                            failure,
                        };
                    }),
                );

                // Process results in order for consistent logging
                results.forEach((result, i) => {
                    successes += result.success;
                    if (result.failure) {
                        failures.push(result.failure);
                    }
                    const success_rate = successes / (i + 1);
                    log.info(
                        `${result.status} [${i + 1}/${num_tests}] (${success_rate.toFixed(
                            2,
                        )}): ${result.song_name}`,
                    );
                });

                assertGreaterOrEqual(
                    successes / num_tests,
                    EXPECTED_SUCCESS_RATE,
                    `Success rate below expected for ${source} category ${category}.\n\nFailures:\n${failures
                        .map(formatFailure)
                        .join("\n")}`,
                );
            },
        );
    }
}

function formatFailure(f: Failure): string {
    const source_release = f.test[f.source];
    const info = `${f.test.song_name} (${sourceUrl(f.source, source_release.id)})`;
    const expected =
        typeof source_release.release == "string"
            ? source_release.release
            : source_release.release.join(" | ");
    return `${info}:\n    Expected: ${expected}\n    Actual: ${f.actual}`;
}

function sourceUrl(source: Source, id: string): string {
    return source === "spotify"
        ? `https://open.spotify.com/album/${id}`
        : `https://music.apple.com/us/album/${id}`;
}
