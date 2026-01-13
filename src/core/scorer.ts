import type { ReleaseMetadata, TargetMetadata } from "../types/common.ts";

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
    const release_artists = release.artists.map((a) => a.toLowerCase());
    const target_artists = target.artists.map((a) => a.toLowerCase());

    const artist_matches = target_artists.filter((a) =>
        release_artists.includes(a),
    ).length;

    score += (artist_matches / target_artists.length) * 30;

    // Track count match
    if (release.track_count === target.tracks.length) {
        score += 20;
    } else {
        const diff = Math.abs(
            release.track_count - target.tracks.length,
        );
        score += Math.max(0, 20 - diff * 5);
    }

    // Release-group date proximity
    if (release.release_group.release_date && target.release_date) {
        const [ty, tm] = target.release_date.split("-").map(Number);
        const [ry, rm] =
            release.release_group.release_date.split("-").map(Number);

        const month_delta = Math.abs((ry - ty) * 12 + (rm - tm));

        let multiplier = 0;
        if (month_delta <= 3) multiplier = 1.0;
        else if (month_delta <= 6) multiplier = 0.8;
        else if (month_delta <= 12) multiplier = 0.5;
        else if (month_delta <= 24) multiplier = 0.2;

        score += 30 * multiplier;
    }

    // Country preference
    if (["XW", null].includes(release.country)) {
        score += 10;
    } else if (release.country && ["US", "GB"].includes(release.country)) {
        score += 5;
    }

    // Disambiguation bonus
    if (!release.disambiguation || release.disambiguation.trim() === "") {
        score += 10;
    }

    // Track list matching
    if (release.tracks && target.tracks.length > 0) {
        const overlap = computeTrackOverlapRatio(
            target.tracks,
            release.tracks,
        );

        if (overlap > 0) {
            const TRACK_MATCH_WEIGHT = 40;
            score += Math.round(overlap * TRACK_MATCH_WEIGHT);
        }

        // High-confidence lock
        if (overlap >= 0.8) {
            score = Math.max(score, 95);
        }
    }

    return score;
}

function computeTrackOverlapRatio(
    targetTracks: TargetMetadata["tracks"],
    releaseTracks: ReleaseMetadata["tracks"],
): number {

    if (!targetTracks.length || !releaseTracks || !releaseTracks.length) return 0;

    const targetSet = new Set(
        targetTracks.map((t) => normalizeTrackTitle(t.name)),
    );

    const releaseSet = new Set(
        releaseTracks.map((t) => normalizeTrackTitle(t.title)),
    );

    let matches = 0;
    for (const t of targetSet) {
        if (releaseSet.has(t)) matches++;
    }

    return matches / Math.max(targetSet.size, releaseSet.size);
}

function normalizeTrackTitle(title: string): string {
    return title
        .toLowerCase()
        .replace(/\(.*?\)/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(/feat\.?.*/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
