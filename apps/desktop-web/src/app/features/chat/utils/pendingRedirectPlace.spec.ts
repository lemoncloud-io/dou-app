import { describe, expect, it } from 'vitest';

import { pendingRedirectPlace } from './pendingRedirectPlace';

const filedPlaces = new Map([['dm-1', ['place-b']]]);
const here = { placeId: 'place-a', listedIds: new Set(['group-a']), filedPlaces, redirectedId: null };

describe('pendingRedirectPlace', () => {
    it('moves a pending 1:1 to its own place', () => {
        expect(pendingRedirectPlace('dm-1', here)).toBe('place-b');
    });

    it('moves only once per room', () => {
        expect(pendingRedirectPlace('dm-1', { ...here, redirectedId: 'dm-1' })).toBeNull();
    });

    it('stays when this place lists the room', () => {
        expect(pendingRedirectPlace('dm-1', { ...here, listedIds: new Set(['dm-1']) })).toBeNull();
    });

    it('goes to the named place for a channel that is not a known 1:1', () => {
        expect(pendingRedirectPlace('group-b', { ...here, namedPlaceId: 'place-b' })).toBe('place-b');
    });

    it("prefers a 1:1's own place over the named place", () => {
        expect(pendingRedirectPlace('dm-1', { ...here, namedPlaceId: 'place-c' })).toBe('place-b');
    });

    it('moves an uncached 1:1 to the place its id names', () => {
        expect(pendingRedirectPlace('place-c@me@p1', { ...here, namedPlaceId: 'place-a' })).toBe('place-c');
    });

    it('stays while no place is selected', () => {
        expect(pendingRedirectPlace('dm-1', { ...here, placeId: null, namedPlaceId: 'place-a' })).toBeNull();
    });

    it('stays for a room no place is known to list', () => {
        expect(pendingRedirectPlace('dm-new', here)).toBeNull();
        expect(pendingRedirectPlace(null, here)).toBeNull();
    });

    describe('for a place-bound room', () => {
        const self = new Map([['self', ['place-a', 'place-b']]]);
        const selfHere = { ...here, listedIds: new Set(['self']), filedPlaces: self, placeBound: true };

        it('moves to the named place although this place lists the room', () => {
            expect(pendingRedirectPlace('self', { ...selfHere, namedPlaceId: 'place-b' })).toBe('place-b');
        });

        it('moves only once per room', () => {
            expect(
                pendingRedirectPlace('self', { ...selfHere, namedPlaceId: 'place-b', redirectedId: 'self' })
            ).toBeNull();
        });

        it('stays when none or this place was named', () => {
            expect(pendingRedirectPlace('self', selfHere)).toBeNull();
            expect(pendingRedirectPlace('self', { ...selfHere, namedPlaceId: 'place-a' })).toBeNull();
        });
    });
});
