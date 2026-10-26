/**
 * `lib/versionAdoption.ts`
 * - The arithmetic behind the version adoption view: which versions to ask about, how much of the
 *   app population can send statistics, and how a version spread day by day.
 *
 * The server counts records per value (`groupBy`) but not people per value, so the view asks once
 * per value for distinct users. These helpers pick that short list and fold the answers. Every
 * user count is per value: someone who updated during the period is counted under both versions,
 * so sums of them run high, and shares built from them are approximate.
 */
import type { StatsBucket } from '../api/reportLogApi';

/** The first app version that collects statistics. */
export const STATS_MIN_VERSION = '0.29.2';

/** How many values the view asks distinct users for — one request each. */
export const MAX_ASKED = 8;

/**
 * `x.y.z` as three numbers, tolerating a leading `v` and a pre-release or build suffix
 * (`0.30.0-rc.1`, `0.30.0+512`). Anything else is not a version this view can order.
 */
export const parseVersion = (value: string | undefined): [number, number, number] | undefined => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec((value ?? '').trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
};

/** Numeric order, oldest first; an unparseable version sorts before every real one. */
export const compareVersions = (a: string, b: string): number => {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
    return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
};

/** True for a version that sends statistics; one that does not parse is not counted as able to. */
export const canSendStats = (version: string): boolean =>
    !!parseVersion(version) && compareVersions(version, STATS_MIN_VERSION) >= 0;

/** Buckets with a real value, most records first, as the server ranked them. */
export const namedBuckets = (buckets: StatsBucket[] | undefined): StatsBucket[] =>
    (buckets ?? []).filter(bucket => bucket.key !== '' && bucket.key !== 'null' && bucket.key !== 'undefined');

/** The highest parseable version among `versions`. */
export const newestVersion = (versions: string[]): string | undefined =>
    versions
        .filter(version => parseVersion(version))
        .sort(compareVersions)
        .pop();

/**
 * Which values to ask distinct users for: the ones with the most records — and, for app versions,
 * the newest one even when it is not among them yet, since a fresh release starts small and is
 * exactly the one someone opens this view to watch.
 */
export const valuesToAsk = (buckets: StatsBucket[] | undefined, withNewest: boolean, max = MAX_ASKED): string[] => {
    const keys = namedBuckets(buckets).map(bucket => bucket.key);
    const top = keys.slice(0, max);
    if (!withNewest) return top;
    const newest = newestVersion(keys);
    return newest && !top.includes(newest) ? [...top.slice(0, max - 1), newest] : top;
};

export interface Coverage {
    /** Users on a version that sends statistics (summed per version). */
    eligible: number;
    /** Users on any of the versions asked about (summed per version). */
    total: number;
    share: number;
}

/**
 * The share of app users on a version that sends statistics. Both sides are sums of per-version
 * users, so someone who updated is in both — the share is an approximation, and only over the
 * versions asked about.
 */
export const statsCoverage = (perVersion: Array<{ version: string; users: number }>): Coverage | undefined => {
    const total = perVersion.reduce((acc, item) => acc + item.users, 0);
    if (total <= 0) return undefined;
    const eligible = perVersion.filter(item => canSendStats(item.version)).reduce((acc, item) => acc + item.users, 0);
    return { eligible, total, share: eligible / total };
};

export type DayBucket = { key: number; val: number; users?: number };

/** A bucket's people — zero when the server left users out, never its record count. */
const peopleIn = (bucket: DayBucket): number => bucket.users ?? 0;

/** The first day a trend has anyone in it. */
export const firstSeenDay = (trend: DayBucket[] | undefined): number | undefined =>
    (trend ?? [])
        .filter(bucket => peopleIn(bucket) > 0 || bucket.val > 0)
        .map(bucket => bucket.key)
        .sort((a, b) => a - b)[0];

export interface AdoptionCell {
    version: string;
    users: number;
    /** Of that day's users across every version asked about; `undefined` on a day with none. */
    share?: number;
}

export interface AdoptionDay {
    day: number;
    cells: AdoptionCell[];
    /** Users across every version asked about that day (summed per version). */
    total: number;
}

/**
 * Days as rows and `columns` (a few versions) as columns. A cell's share is of the day's users
 * across every version in `perVersion`, not only the columns, so three columns need not add up to
 * 100%. Days run oldest first.
 */
export const adoptionByDay = (
    perVersion: Array<{ version: string; trend: DayBucket[] | undefined }>,
    columns: string[]
): AdoptionDay[] => {
    const byDay = new Map<number, Map<string, number>>();
    perVersion.forEach(({ version, trend }) =>
        (trend ?? []).forEach(bucket => {
            const day = byDay.get(bucket.key) ?? new Map<string, number>();
            day.set(version, (day.get(version) ?? 0) + peopleIn(bucket));
            byDay.set(bucket.key, day);
        })
    );
    return [...byDay.entries()]
        .sort(([a], [b]) => a - b)
        .map(([day, users]) => {
            const total = [...users.values()].reduce((acc, n) => acc + n, 0);
            return {
                day,
                total,
                cells: columns.map(version => {
                    const n = users.get(version) ?? 0;
                    return { version, users: n, share: total > 0 ? n / total : undefined };
                }),
            };
        });
};
