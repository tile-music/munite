import { assertGreaterOrEqual } from "@std/assert";
import { init, spotifyAlbumToMusicBrainz } from "./main.ts";
import testsJson from "./tests.json" with { type: "json" };
const tests = testsJson as unknown as Tests;

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

for (const [category, category_tests] of Object.entries(tests)) {
    Deno.test(`Spotify Album to MusicBrainz ID - ${category}`, async () => {
        const num_tests = category_tests.length;
        const failures: Failure[] = [];
        let successes = 0;

        for (let i = 0; i < num_tests; i++) {
            const test = category_tests[i];
            const [
                album_info,
                spotify_album,
                expected_musicbrainz_release_group_id,
                expected_musicbrainz_id,
            ] = test;
            const musicbrainz_result =
                await spotifyAlbumToMusicBrainz(spotify_album);
            let status;

            if (musicbrainz_result.status != "success") {
                failures.push({
                    test,
                    actual: musicbrainz_result.message,
                });
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
                        successes += 0.5;
                        status = "PARTIAL";
                    } else {
                        status = "FAILED!";
                    }
                    failures.push({ test, actual });
                } else {
                    successes += 1;
                    status = "SUCCESS";
                }
            }

            const success_rate = successes / (i + 1);
            console.log(
                `${status} [${i + 1}/${num_tests}] (${success_rate.toFixed(
                    2,
                )}): ${album_info}`,
            );
        }

        assertGreaterOrEqual(
            (num_tests - failures.length) / num_tests,
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
