import { describe, expect, it } from 'vitest';

import type { MessageJumpOrigin } from '../../../shared';
import { originFor, returnRoute, shouldOfferReturn, type ReaderLocation } from './jumpReturn';

const here: ReaderLocation = { cloudId: 'c1', placeId: 'p1', channelId: 'general' };
const details = { label: '#general', position: { channelId: 'general', chatNo: 42 }, threadRootId: 'root-7' };

const origin = (overrides: Partial<MessageJumpOrigin> = {}): MessageJumpOrigin => ({
    cloudId: 'c1',
    placeId: 'p1',
    channelId: 'general',
    label: '#general',
    anchorChatNo: 42,
    threadRootId: null,
    sameChannel: false,
    ...overrides,
});

describe('originFor', () => {
    it('records the reading position and the open thread, not just the channel', () => {
        expect(originFor(here, 'random', details)).toEqual({
            cloudId: 'c1',
            placeId: 'p1',
            channelId: 'general',
            label: '#general',
            anchorChatNo: 42,
            threadRootId: 'root-7',
            sameChannel: false,
        });
    });

    it('records a jump inside the open channel, marked as one', () => {
        expect(originFor(here, 'general', details)?.sameChannel).toBe(true);
    });

    it('treats a position reported for another channel as the latest', () => {
        const stale = { ...details, position: { channelId: 'random', chatNo: 9 } };
        expect(originFor(here, 'random', stale)?.anchorChatNo).toBeNull();
    });

    it('records nothing with no channel open', () => {
        expect(originFor({ ...here, channelId: null }, 'random', details)).toBeNull();
    });
});

describe('shouldOfferReturn', () => {
    const listed = new Set(['general', 'random']);

    it('offers the way back from another channel', () => {
        expect(shouldOfferReturn(origin(), { ...here, channelId: 'random' }, listed)).toBe(true);
    });

    it('stops offering once the reader is back in the origin channel', () => {
        expect(shouldOfferReturn(origin(), here, listed)).toBe(false);
    });

    it('keeps offering after a jump that stayed in the channel', () => {
        expect(shouldOfferReturn(origin({ sameChannel: true }), here, listed)).toBe(true);
    });

    it('does not offer a channel of this place that left the list', () => {
        expect(shouldOfferReturn(origin(), { ...here, channelId: 'random' }, new Set(['random']))).toBe(false);
    });

    // The list only holds the open place, so it cannot vouch for a channel elsewhere.
    it('offers an origin in another place or cloud without finding it in this list', () => {
        const away = new Set(['random']);
        expect(shouldOfferReturn(origin({ placeId: 'p2' }), { ...here, channelId: 'random' }, away)).toBe(true);
        expect(shouldOfferReturn(origin({ cloudId: 'c2' }), { ...here, channelId: 'random' }, away)).toBe(true);
    });

    it('offers nothing without an origin', () => {
        expect(shouldOfferReturn(null, here, listed)).toBe(false);
    });
});

describe('returnRoute', () => {
    it('switches cloud first, then place, else selects', () => {
        expect(returnRoute(origin({ cloudId: 'c2' }), here)).toBe('switch-cloud');
        expect(returnRoute(origin({ placeId: 'p2' }), here)).toBe('switch-place');
        expect(returnRoute(origin(), here)).toBe('select');
    });

    // Switching to "no place" would arm the landing and then never move.
    it('selects in this place when the origin recorded no place', () => {
        expect(returnRoute(origin({ placeId: null }), here)).toBe('select');
    });
});
