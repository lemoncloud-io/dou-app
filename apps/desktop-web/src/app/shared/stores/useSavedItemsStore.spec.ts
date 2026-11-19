import { describe, expect, it } from 'vitest';

import { isSavedInCloud, savedOriginOf } from './useSavedItemsStore';

describe('savedOriginOf', () => {
    it('tags a cloud message with its cloud and the place the session is in', () => {
        expect(savedOriginOf({ kind: 'cloud', cloudId: 'K1', siteId: 'P1' })).toEqual({
            cloudId: 'K1',
            placeId: 'P1',
        });
    });

    it('leaves the place out when a cloud session has none selected', () => {
        expect(savedOriginOf({ kind: 'cloud', cloudId: 'K1', siteId: null })).toEqual({
            cloudId: 'K1',
            placeId: undefined,
        });
    });

    it("tags a Default Cloud message with the 'default' sentinel, not the relay's personal place", () => {
        expect(savedOriginOf({ kind: 'relay', siteId: '0000' })).toEqual({ cloudId: 'default', placeId: 'default' });
    });
});

describe('isSavedInCloud', () => {
    it('keeps an item that records its cloud to that cloud', () => {
        expect(isSavedInCloud({ cloudId: 'K1', placeId: 'P1' }, 'K1')).toBe(true);
        expect(isSavedInCloud({ cloudId: 'K2', placeId: 'P1' }, 'K1')).toBe(false);
        expect(isSavedInCloud({ cloudId: 'default', placeId: 'default' }, 'K1')).toBe(false);
        expect(isSavedInCloud({ cloudId: 'default', placeId: 'default' }, 'default')).toBe(true);
    });

    it("places an older item's 'default' place on the Default Cloud only", () => {
        expect(isSavedInCloud({ placeId: 'default' }, 'default')).toBe(true);
        expect(isSavedInCloud({ placeId: 'default' }, 'K1')).toBe(false);
    });

    // Every cloud numbers its places from the same start, so a real place names no one cloud.
    it("shows an older item's real place in every cloud but the Default Cloud", () => {
        expect(isSavedInCloud({ placeId: '10001' }, 'K1')).toBe(true);
        expect(isSavedInCloud({ placeId: '10001' }, 'K2')).toBe(true);
        expect(isSavedInCloud({ placeId: '10001' }, 'default')).toBe(false);
    });

    it('shows an older item with no place anywhere, since opening it switches nothing', () => {
        expect(isSavedInCloud({}, 'K1')).toBe(true);
        expect(isSavedInCloud({}, 'default')).toBe(true);
    });
});
