import { describe, expect, it } from 'vitest';

import {
    adoptionByDay,
    canSendStats,
    compareVersions,
    firstSeenDay,
    namedBuckets,
    newestVersion,
    parseVersion,
    statsCoverage,
    valuesToAsk,
} from './versionAdoption';

const DAY = 86_400_000;

describe('parseVersion', () => {
    it('reads x.y.z with an optional v and suffix', () => {
        expect(parseVersion('0.29.2')).toEqual([0, 29, 2]);
        expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
        expect(parseVersion('0.30.0-rc.1')).toEqual([0, 30, 0]);
        expect(parseVersion('0.30.0+512')).toEqual([0, 30, 0]);
    });

    it('rejects anything else', () => {
        expect(parseVersion('0.29')).toBeUndefined();
        expect(parseVersion('web')).toBeUndefined();
        expect(parseVersion(undefined)).toBeUndefined();
        expect(parseVersion('')).toBeUndefined();
    });
});

describe('compareVersions', () => {
    it('orders numerically, not as text', () => {
        expect(['0.29.10', '0.29.2', '0.3.0', '1.0.0'].sort(compareVersions)).toEqual([
            '0.3.0',
            '0.29.2',
            '0.29.10',
            '1.0.0',
        ]);
    });

    it('puts an unparseable version first', () => {
        expect(['0.29.2', 'dev'].sort(compareVersions)).toEqual(['dev', '0.29.2']);
    });
});

describe('canSendStats', () => {
    it('is true from 0.29.2 on', () => {
        expect(canSendStats('0.29.2')).toBe(true);
        expect(canSendStats('0.29.10')).toBe(true);
        expect(canSendStats('0.30.0')).toBe(true);
    });

    it('is false before 0.29.2 and for a version that does not parse', () => {
        expect(canSendStats('0.29.1')).toBe(false);
        expect(canSendStats('0.28.9')).toBe(false);
        expect(canSendStats('beta')).toBe(false);
    });
});

describe('namedBuckets and newestVersion', () => {
    it('drops buckets without a value', () => {
        expect(
            namedBuckets([
                { key: '', val: 3 },
                { key: '0.29.2', val: 2 },
                { key: 'null', val: 1 },
            ])
        ).toEqual([{ key: '0.29.2', val: 2 }]);
        expect(namedBuckets(undefined)).toEqual([]);
    });

    it('picks the highest parseable version', () => {
        expect(newestVersion(['0.29.2', 'x', '0.29.10', '0.28.0'])).toBe('0.29.10');
        expect(newestVersion(['x'])).toBeUndefined();
    });
});

describe('valuesToAsk', () => {
    const buckets = ['0.29.1', '0.29.0', '0.28.9', '0.28.8', '0.30.0'].map((key, i) => ({ key, val: 50 - i }));

    it('takes the values with the most records', () => {
        expect(valuesToAsk(buckets, false, 3)).toEqual(['0.29.1', '0.29.0', '0.28.9']);
    });

    it('swaps the newest version in for the last place when it is outside the top', () => {
        expect(valuesToAsk(buckets, true, 3)).toEqual(['0.29.1', '0.29.0', '0.30.0']);
    });

    it('leaves the list alone when the newest is already in it', () => {
        expect(valuesToAsk(buckets, true, 8)).toEqual(['0.29.1', '0.29.0', '0.28.9', '0.28.8', '0.30.0']);
    });
});

describe('statsCoverage', () => {
    it('shares users on 0.29.2 and later among the versions asked about', () => {
        expect(
            statsCoverage([
                { version: '0.29.2', users: 30 },
                { version: '0.30.0', users: 50 },
                { version: '0.29.1', users: 20 },
            ])
        ).toEqual({ eligible: 80, total: 100, share: 0.8 });
    });

    it('counts an unparseable version as not able to send', () => {
        expect(statsCoverage([{ version: 'dev', users: 5 }])?.share).toBe(0);
    });

    it('is undefined with no users', () => {
        expect(statsCoverage([])).toBeUndefined();
        expect(statsCoverage([{ version: '0.30.0', users: 0 }])).toBeUndefined();
    });
});

describe('firstSeenDay', () => {
    it('finds the first day with anyone', () => {
        expect(
            firstSeenDay([
                { key: 3 * DAY, val: 4, users: 2 },
                { key: DAY, val: 0, users: 0 },
                { key: 2 * DAY, val: 1, users: 1 },
            ])
        ).toBe(2 * DAY);
    });

    it('is undefined for an empty trend', () => {
        expect(firstSeenDay(undefined)).toBeUndefined();
        expect(firstSeenDay([{ key: DAY, val: 0, users: 0 }])).toBeUndefined();
    });
});

describe('adoptionByDay', () => {
    it('shares each column of the day across every version asked about, oldest day first', () => {
        const days = adoptionByDay(
            [
                { version: '0.30.0', trend: [{ key: 2 * DAY, val: 9, users: 6 }] },
                {
                    version: '0.29.2',
                    trend: [
                        { key: DAY, val: 9, users: 8 },
                        { key: 2 * DAY, val: 3, users: 2 },
                    ],
                },
                { version: '0.29.1', trend: [{ key: DAY, val: 2, users: 2 }] },
            ],
            ['0.30.0', '0.29.2']
        );
        expect(days.map(day => day.day)).toEqual([DAY, 2 * DAY]);
        expect(days[0]).toEqual({
            day: DAY,
            total: 10,
            cells: [
                { version: '0.30.0', users: 0, share: 0 },
                { version: '0.29.2', users: 8, share: 0.8 },
            ],
        });
        expect(days[1].cells.map(cell => cell.share)).toEqual([0.75, 0.25]);
    });

    it('leaves the share empty on a day with no users', () => {
        const [day] = adoptionByDay([{ version: '0.30.0', trend: [{ key: DAY, val: 0, users: 0 }] }], ['0.30.0']);
        expect(day.cells[0].share).toBeUndefined();
    });
});
