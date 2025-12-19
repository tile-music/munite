export type ReleaseMetadata = {
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

export type TargetMetadata = {
    title: string;
    artists: string[];
    tracks: {
        name: string;
        duration_ms: number;
    }[];
    release_date: string | null;
};

export function scoreRelease(
    release: ReleaseMetadata,
    target: TargetMetadata,
): number {
    let score = 0;

    // Title match
    if (release.title.toLowerCase() === target.title.toLowerCase()) {
        score += 40;
    }

    // Artist match
    const release_artists = release.artists.map((artist) =>
        artist.toLowerCase(),
    );
    const target_artists = target.artists.map((artist) => artist.toLowerCase());
    const artist_matches = target_artists.filter((artist) =>
        release_artists.includes(artist),
    ).length;
    score += (artist_matches / target_artists.length) * 30;

    // Track count match
    if (release.track_count === target.tracks.length) {
        score += 20;
    } else {
        const track_count_diff = Math.abs(
            release.track_count - target.tracks.length,
        );
        score += Math.max(0, 20 - track_count_diff * 5); // Deduct 5 points per track difference
    }

    // Release group release date match
    if (release.release_group_release_date && target.release_date) {
        const [target_year, target_month] = target.release_date
            .split("-")
            .map(Number);
        const [release_year, release_month] = release.release_group_release_date
            .split("-")
            .map(Number);

        const month_delta = Math.abs(
            (release_year - target_year) * 12 + (release_month - target_month),
        );

        let month_multiplier = 0;
        if (month_delta <= 3) {
            month_multiplier = 1.0;
        } else if (month_delta <= 6) {
            month_multiplier = 0.8;
        } else if (month_delta <= 12) {
            month_multiplier = 0.5;
        } else if (month_delta <= 24) {
            month_multiplier = 0.2;
        }

        score += 30 * month_multiplier;
    }

    // Country is null or XW
    if (["XW", null].includes(release.country)) {
        score += 10;
    } else if (release.country && ["US", "GB"].includes(release.country)) {
        score += 5;
    }

    // Disambiguation is empty
    if (!release.disambiguation || release.disambiguation.trim() === "") {
        score += 10;
    }

    return score;
}
