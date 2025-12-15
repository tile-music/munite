import testsJson from "./tests.json" with { type: "json" };
const tests = testsJson as unknown as Tests;

type Tests = {
    albums: Test[];
    deluxe_albums: Test[];
    singles: Test[];
    eps: Test[];
};
type Test = [string, string, string | string[]];

async function main() {
    for (const [category, category_tests] of Object.entries(tests)) {
        console.log(category + ":");
        for (const test of category_tests) {
            const [album_info, spotify_id, expected_musicbrainz_id] = test;
            const mbid =
                typeof expected_musicbrainz_id == "string"
                    ? expected_musicbrainz_id
                    : expected_musicbrainz_id[0];
            const url = `https://musicbrainz.org/ws/2/release/${mbid}?inc=release-groups&fmt=json`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "StreamBee/1.0 (mail@samranda.com)",
                },
            });
            if (!response.ok) {
                console.error(
                    `Failed to fetch MusicBrainz release for ${album_info}: ${response.status}`,
                );
                continue;
            }
            const data = await response.json();
            const release_group = data["release-group"];
            const rg_id = release_group.id;

            const new_test = [
                album_info,
                spotify_id,
                rg_id,
                expected_musicbrainz_id,
            ];
            console.log(JSON.stringify(new_test) + ",");
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
}
main();
