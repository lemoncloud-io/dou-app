import type { CloudView } from '@lemoncloud/chatic-backend-api';

import {
    findHeldClouds,
    hasDropMarks,
    initialKeepIds,
    isSameKeepChoice,
    keepCandidates,
    needsKeepChoice,
    toDropIds,
    toggleKeep,
} from './keepClouds';

const cloud = (id: string, overrides: Partial<CloudView> = {}): CloudView =>
    ({ id, status: 'active', state$: { provision: 'active' }, ...overrides }) as CloudView;

describe('keepCandidates', () => {
    it('drops expired and released clouds but keeps held ones', () => {
        const held = cloud('held', { status: 'suspended', state$: { provision: 'active', hold: 'downgrade' } });
        const list = [
            cloud('a'),
            cloud('gone', { status: 'expired' }),
            cloud('released', { state$: { life: 'released' } }),
            held,
        ];

        expect(keepCandidates(list).map(c => c.id)).toEqual(['a', 'held']);
    });
});

describe('initialKeepIds', () => {
    it('opens empty when no choice has been sent', () => {
        expect(initialKeepIds([cloud('a'), cloud('b')])).toEqual([]);
    });

    it('opens on the clouds the relay keeps once a choice exists', () => {
        const marked = cloud('b', { state$: { provision: 'active', plan: 'drop' } });

        expect(hasDropMarks([cloud('a'), marked])).toBe(true);
        expect(initialKeepIds([cloud('a'), marked])).toEqual(['a']);
    });

    it('ignores plannedAt left behind by a cleared mark', () => {
        expect(initialKeepIds([cloud('a', { plannedAt: 123 }), cloud('b')])).toEqual([]);
    });
});

describe('toDropIds', () => {
    it('sends every candidate that was not kept', () => {
        expect(toDropIds([cloud('a'), cloud('b'), cloud('c')], ['b'])).toEqual(['a', 'c']);
    });
});

describe('needsKeepChoice', () => {
    it('is owed only when the clouds exceed the next allowance', () => {
        expect(needsKeepChoice(2, 1)).toBe(true);
        expect(needsKeepChoice(1, 1)).toBe(false);
        expect(needsKeepChoice(3, null)).toBe(false);
        expect(needsKeepChoice(3, undefined)).toBe(false);
    });
});

describe('toggleKeep', () => {
    it('adds and removes', () => {
        expect(toggleKeep([], 'a', 2)).toEqual(['a']);
        expect(toggleKeep(['a', 'b'], 'a', 2)).toEqual(['b']);
    });

    it('pushes out the oldest pick instead of growing past the limit', () => {
        expect(toggleKeep(['a'], 'b', 1)).toEqual(['b']);
        expect(toggleKeep(['a', 'b'], 'c', 2)).toEqual(['b', 'c']);
    });
});

describe('isSameKeepChoice', () => {
    it('compares as sets', () => {
        expect(isSameKeepChoice(['a', 'b'], ['b', 'a'])).toBe(true);
        expect(isSameKeepChoice(['a'], ['b'])).toBe(false);
        expect(isSameKeepChoice(['a'], ['a', 'b'])).toBe(false);
    });
});

describe('findHeldClouds', () => {
    it('finds clouds the relay held for a downgrade', () => {
        const list = [
            cloud('a'),
            cloud('held', { status: 'suspended', state$: { provision: 'active', hold: 'downgrade' } }),
            cloud('lapsed', { status: 'suspended', state$: { provision: 'active', hold: 'expired' } }),
        ];

        expect(findHeldClouds(list).map(c => c.id)).toEqual(['held']);
    });
});
