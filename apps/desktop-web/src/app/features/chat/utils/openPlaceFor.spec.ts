import { describe, expect, it } from 'vitest';

import { openPlaceFor } from './openPlaceFor';

const dmPlaces = new Map([
    ['dm-both', ['place-a', 'place-b']],
    ['dm-b', ['place-b']],
    ['dm-bc', ['place-b', 'place-c']],
    ['self', ['place-a', 'place-b', 'place-c']],
]);

describe('openPlaceFor', () => {
    it('stays in this place when it lists the 1:1, whatever place the request named', () => {
        expect(openPlaceFor({ placeId: 'place-b', channelId: 'dm-both' }, { placeId: 'place-a', dmPlaces })).toBe(
            'place-a'
        );
    });

    it('goes to the named place when it lists the 1:1 and this place does not', () => {
        expect(openPlaceFor({ placeId: 'place-c', channelId: 'dm-bc' }, { placeId: 'place-a', dmPlaces })).toBe(
            'place-c'
        );
    });

    // A notification names the room's stamped place, which need not list it.
    it('goes to a place that lists the 1:1 when neither this place nor the named one does', () => {
        expect(openPlaceFor({ placeId: 'place-a', channelId: 'dm-b' }, { placeId: 'place-c', dmPlaces })).toBe(
            'place-b'
        );
    });

    it('keeps the named place for a channel that is not a known 1:1', () => {
        expect(openPlaceFor({ placeId: 'place-c', channelId: 'group-1' }, { placeId: 'place-a', dmPlaces })).toBe(
            'place-c'
        );
        expect(openPlaceFor({ placeId: '', channelId: 'dm-new' }, { placeId: 'place-a', dmPlaces })).toBe('');
    });

    // The Self Channel is listed in every place, but each place holds its own messages: an item saved
    // in place B has to be opened from place B.
    describe('for a place-bound room', () => {
        it('goes to the named place even though this place lists the room too', () => {
            expect(
                openPlaceFor(
                    { placeId: 'place-b', channelId: 'self', placeBound: true },
                    { placeId: 'place-a', dmPlaces }
                )
            ).toBe('place-b');
        });

        it('stays when the request named this place, or none', () => {
            expect(
                openPlaceFor(
                    { placeId: 'place-a', channelId: 'self', placeBound: true },
                    { placeId: 'place-a', dmPlaces }
                )
            ).toBe('place-a');
            expect(
                openPlaceFor({ placeId: '', channelId: 'self', placeBound: true }, { placeId: 'place-a', dmPlaces })
            ).toBe('place-a');
        });

        it('stays when the named place is not one that lists the room', () => {
            expect(
                openPlaceFor({ placeId: 'gone', channelId: 'self', placeBound: true }, { placeId: 'place-a', dmPlaces })
            ).toBe('place-a');
        });
    });
});
