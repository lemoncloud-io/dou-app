import type { StatsBucket } from '../api/reportLogApi';

export const STATS_MIN_VERSION = '0.29.2';

export const MAX_ASKED = 8;

export const parseVersion = (value: string | undefined): [number, number, number] | undefined => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec((value ?? '').trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
};

export const compareVersions = (a: string, b: string): number => {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
    return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
};

export const canSendStats = (version: string): boolean =>
    !!parseVersion(version) && compareVersions(version, STATS_MIN_VERSION) >= 0;

export const namedBuckets = (buckets: StatsBucket[] | undefined): StatsBucket[] =>
    (buckets ?? []).filter(bucket => bucket.key !== '' && bucket.key !== 'null' && bucket.key !== 'undefined');

export const newestVersion = (versions: string[]): string | undefined =>
    versions
        .filter(version => parseVersion(version))
        .sort(compareVersions)
        .pop();

export const valuesToAsk = (buckets: StatsBucket[] | undefined, withNewest: boolean, max = MAX_ASKED): string[] => {
    const keys = namedBuckets(buckets).map(bucket => bucket.key);
    const top = keys.slice(0, max);
    if (!withNewest) return top;
    const newest = newestVersion(keys);
    return newest && !top.includes(newest) ? [...top.slice(0, max - 1), newest] : top;
};

export interface Coverage {
    eligible: number;
    total: number;
    share: number;
}

export const statsCoverage = (perVersion: Array<{ version: string; users: number }>): Coverage | undefined => {
    const total = perVersion.reduce((acc, item) => acc + item.users, 0);
    if (total <= 0) return undefined;
    const eligible = perVersion.filter(item => canSendStats(item.version)).reduce((acc, item) => acc + item.users, 0);
    return { eligible, total, share: eligible / total };
};

export type DayBucket = { key: number; val: number; users?: number };

const peopleIn = (bucket: DayBucket): number => bucket.users ?? 0;

export const firstSeenDay = (trend: DayBucket[] | undefined): number | undefined =>
    (trend ?? [])
        .filter(bucket => peopleIn(bucket) > 0 || bucket.val > 0)
        .map(bucket => bucket.key)
        .sort((a, b) => a - b)[0];

export interface AdoptionCell {
    version: string;
    users: number;
    share?: number;
}

export interface AdoptionDay {
    day: number;
    cells: AdoptionCell[];
    total: number;
}

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
