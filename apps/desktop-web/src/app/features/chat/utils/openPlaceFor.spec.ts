import { describe, expect, it } from 'vitest';

import { openPlaceFor } from './openPlaceFor';

const filedPlaces = new Map([
    ['place-b@me@p1', ['place-b']],
    ['me@p2', ['place-c']],
    ['self', ['place-a', 'place-b', 'place-c']],
]);

describe('openPlaceFor', () => {
    // A notification names the place its sender was in, which need not be the room's.
    it('opens a 1:1 in its own place, whatever place the request named or I am in', () => {
        expect(
            openPlaceFor({ placeId: 'place-a', channelId: 'place-b@me@p1' }, { placeId: 'place-c', filedPlaces })
        ).toBe('place-b');
        expect(openPlaceFor({ placeId: '', channelId: 'place-b@me@p1' }, { placeId: 'place-a', filedPlaces })).toBe(
            'place-b'
        );
    });

    // A room from before 1:1s were keyed by place has a pair key; its row says where it lives.
    it('opens a pair-key 1:1 in the place its cached row names', () => {
        expect(openPlaceFor({ placeId: 'place-a', channelId: 'me@p2' }, { placeId: 'place-a', filedPlaces })).toBe(
            'place-c'
        );
    });

    // A room just started is not cached yet; its place-keyed id names where the server filed it.
    it('opens an uncached 1:1 in the place its id names', () => {
        expect(
            openPlaceFor(
                { placeId: 'place-a', channelId: 'place-c@me@p3' },
                { placeId: 'place-a', filedPlaces: new Map() }
            )
        ).toBe('place-c');
    });

    it('keeps the named place for a group channel and for a room whose place is unknown', () => {
        expect(openPlaceFor({ placeId: 'place-c', channelId: 'group-1' }, { placeId: 'place-a', filedPlaces })).toBe(
            'place-c'
        );
        expect(openPlaceFor({ placeId: '', channelId: 'me@new' }, { placeId: 'place-a', filedPlaces })).toBe('');
    });

    // The Self Channel is listed in every place, but each place holds its own messages: an item saved
    // in place B has to be opened from place B.
    describe('for a place-bound room', () => {
        it('goes to the named place even though this place lists the room too', () => {
            expect(
                openPlaceFor(
                    { placeId: 'place-b', channelId: 'self', placeBound: true },
                    { placeId: 'place-a', filedPlaces }
                )
            ).toBe('place-b');
        });

        it('stays when the request named this place, or none', () => {
            expect(
                openPlaceFor(
                    { placeId: 'place-a', channelId: 'self', placeBound: true },
                    { placeId: 'place-a', filedPlaces }
                )
            ).toBe('place-a');
            expect(
                openPlaceFor({ placeId: '', channelId: 'self', placeBound: true }, { placeId: 'place-a', filedPlaces })
            ).toBe('place-a');
        });

        it('stays when the named place is not one that lists the room', () => {
            expect(
                openPlaceFor(
                    { placeId: 'gone', channelId: 'self', placeBound: true },
                    { placeId: 'place-a', filedPlaces }
                )
            ).toBe('place-a');
        });
    });
});
