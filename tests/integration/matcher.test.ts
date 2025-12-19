import { assertGreaterOrEqual } from "@std/assert";
import { init, matchSpotifyAlbum } from "../../src/mod.ts";
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

type Test = [string, string, string, string | string[]];
type Failure = {
    test: Test;
    actual: string;
};

Deno.test.beforeAll(async () => {
    await init();
});

for (const [category, category_tests] of Object.entries(albums)) {
    Deno.test(`Spotify Album to MusicBrainz ID - ${category}`, async () => {
        const num_tests = category_tests.length;
        const failures: Failure[] = [];
        let successes = 0;

        // Run all tests concurrently
        const results = await Promise.all(
            category_tests.map(async (test, i) => {
                const [
                    album_info,
                    spotify_album,
                    expected_musicbrainz_release_group_id,
                    expected_musicbrainz_id,
                ] = test;

                const musicbrainz_result =
                    await matchSpotifyAlbum(spotify_album);
                let status;
                let success = 0;
                let failure: Failure | null = null;

                if (musicbrainz_result.status != "success") {
                    failure = {
                        test,
                        actual: musicbrainz_result.message,
                    };
                    status = "FAILED!";
                } else {
                    const actual = musicbrainz_result.release_id;
                    if (
                        (typeof expected_musicbrainz_id != "string" &&
                            !expected_musicbrainz_id.includes(actual)) ||
                        (typeof expected_musicbrainz_id == "string" &&
                            actual !== expected_musicbrainz_id)
                    ) {
                        if (
                            musicbrainz_result.release_group_id ===
                            expected_musicbrainz_release_group_id
                        ) {
                            success = 0.5;
                            status = "PARTIAL";
                        } else {
                            status = "FAILED!";
                        }
                        failure = { test, actual };
                    } else {
                        success = 1;
                        status = "SUCCESS";
                    }
                }

                return { status, album_info, index: i, success, failure };
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
                )}): ${result.album_info}`,
            );
        });

        assertGreaterOrEqual(
            successes / num_tests,
            EXPECTED_SUCCESS_RATE,
            `Success rate below expected for category ${category}.\n\nFailures:\n${failures
                .map(formatFailure)
                .join("\n")}`,
        );
    });
}

function formatFailure(f: Failure): string {
    const info = `${f.test[0]} (https://open.spotify.com/album/${f.test[1]})`;
    const expected =
        typeof f.test[3] == "string" ? f.test[3] : f.test[3].join(" | ");
    return `${info}:\n    Expected: ${expected}\n    Actual: ${f.actual}`;
}
