import { describe, expect, it } from 'vitest';

import { pendingRedirectPlace } from './pendingRedirectPlace';

const dmPlaces = new Map([['dm-1', ['place-b']]]);
const here = { placeId: 'place-a', listedIds: new Set(['group-a']), dmPlaces, redirectedId: null };

describe('pendingRedirectPlace', () => {
    // A cross-cloud notification lands in the room's stamped place, which does not list it.
    it('moves a pending 1:1 to a place that lists it', () => {
        expect(pendingRedirectPlace('dm-1', here)).toBe('place-b');
    });

    it('moves only once per room', () => {
        expect(pendingRedirectPlace('dm-1', { ...here, redirectedId: 'dm-1' })).toBeNull();
    });

    it('stays when this place lists the room', () => {
        expect(pendingRedirectPlace('dm-1', { ...here, listedIds: new Set(['dm-1']) })).toBeNull();
    });

    // HomePage mounting with an open request resolves it only once its rows have loaded, so the
    // place the request named is carried here rather than switched to up front.
    it('goes to the named place for a channel that is not a known 1:1', () => {
        expect(pendingRedirectPlace('group-b', { ...here, namedPlaceId: 'place-b' })).toBe('place-b');
    });

    it('prefers a listing place over the named stamp for a 1:1', () => {
        const both = new Map([['dm-1', ['place-b', 'place-c']]]);
        expect(pendingRedirectPlace('dm-1', { ...here, dmPlaces: both, namedPlaceId: 'place-c' })).toBe('place-c');
        expect(pendingRedirectPlace('dm-1', { ...here, namedPlaceId: 'not-mine' })).toBe('place-b');
    });

    // Right after a cloud switch no place is selected; the auto-select effect settles one first, or
    // the single move would be spent on the stamp.
    it('stays while no place is selected', () => {
        expect(pendingRedirectPlace('dm-1', { ...here, placeId: null, namedPlaceId: 'place-a' })).toBeNull();
    });

    // A 1:1 just started is not placed until its sync; the landing waits for it here.
    it('stays for a room no place is known to list', () => {
        expect(pendingRedirectPlace('dm-new', here)).toBeNull();
        expect(pendingRedirectPlace(null, here)).toBeNull();
    });
});
