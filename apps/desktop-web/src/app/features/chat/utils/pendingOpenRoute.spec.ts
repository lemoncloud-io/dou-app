import { describe, expect, it } from 'vitest';

import { pendingOpenRoute } from './pendingOpenRoute';

const here = { cloudId: 'cloud-1', placeId: 'place-a', listedIds: new Set(['ch-1']) };

describe('pendingOpenRoute', () => {
    it('switches cloud for a target in another cloud', () => {
        expect(pendingOpenRoute({ cloudId: 'cloud-2', placeId: 'place-x', channelId: 'ch-9' }, here)).toBe(
            'switch-cloud'
        );
    });

    it('switches place for a target in another place of this cloud', () => {
        expect(pendingOpenRoute({ placeId: 'place-b', channelId: 'ch-9' }, here)).toBe('switch-place');
    });

    it('selects a listed channel in this place', () => {
        expect(pendingOpenRoute({ placeId: 'place-a', channelId: 'ch-1' }, here)).toBe('select');
    });

    it('stays in this place for a target that names no place', () => {
        expect(pendingOpenRoute({ placeId: '', channelId: 'ch-1' }, here)).toBe('select');
    });

    it('waits for a room that is not listed yet instead of selecting it', () => {
        expect(pendingOpenRoute({ placeId: '', channelId: 'dm-new' }, here)).toBe('wait');
    });
});
