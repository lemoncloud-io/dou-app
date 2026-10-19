import type { DomainChannel } from '@chatic/data';
import { describe, expect, it } from 'vitest';

import { listingPlaces, roomPlaces } from './roomPlaces';

const ME = 'me';
const PLACES = ['busy', 'hi', 'again', 'rrrm'];

const group = (id: string, sid: string, memberIds: string[]): DomainChannel =>
    ({ id, name: id, cid: 'cloud-1', sid, stereo: 'private', memberIds }) as DomainChannel;

const dm = (id: string, peerId: string | null, sid = 'busy'): DomainChannel =>
    ({ id, cid: 'cloud-1', sid, stereo: 'dm', memberIds: peerId ? [ME, peerId] : undefined }) as DomainChannel;

describe('roomPlaces', () => {
    // A 1:1 lives in the place it was opened in, whoever its peer shares other places with.
    it('files each 1:1 under its own place only', () => {
        const channels = [
            group('invite demo', 'busy', [ME, 'p1']),
            group('bad bad', 'hi', [ME, 'p1']),
            dm('busy@me@p1', 'p1', 'busy'),
            dm('hi@me@p1', 'p1', 'hi'),
        ];

        const listing = roomPlaces(channels, { placeIds: PLACES });

        expect(listing.get('busy@me@p1')).toEqual(['busy']);
        expect(listing.get('hi@me@p1')).toEqual(['hi']);
    });

    it('files a 1:1 whose row names no place under the place its id names', () => {
        const listing = roomPlaces([dm('hi@me@p1', 'p1', '')], { placeIds: PLACES });

        expect(listing.get('hi@me@p1')).toEqual(['hi']);
    });

    // A room from before 1:1s were keyed by place may name none; no place lists it.
    it('leaves a 1:1 that names no place unfiled', () => {
        expect(roomPlaces([dm('me@p1', 'p1', '')], { placeIds: PLACES }).has('me@p1')).toBe(false);
    });

    it('files a 1:1 under its own place even when that place is not one of mine', () => {
        expect(roomPlaces([dm('dm-1', 'p1', 'their-place')], { placeIds: PLACES }).get('dm-1')).toEqual([
            'their-place',
        ]);
    });

    it('leaves group channels and relay 1:1s out', () => {
        const channels = [
            group('g', 'busy', [ME, 'p1']),
            { id: 'relay-dm', cid: 'default', sid: 'busy', stereo: 'dm', memberIds: [ME, 'p1'] },
        ] as DomainChannel[];

        expect(roomPlaces(channels, { placeIds: PLACES }).size).toBe(0);
    });

    // The server keeps one notes-to-self room per person and returns it for every place, whichever
    // place it was created in.
    it('lists my notes-to-self room in every place', () => {
        const channels = [
            { id: 'U:me', cid: 'cloud-1', sid: 'busy', stereo: 'self', memberIds: [ME] },
        ] as DomainChannel[];

        expect(roomPlaces(channels, { placeIds: PLACES }).get('U:me')).toEqual(PLACES);
    });

    it("lists the relay's notes-to-self room in every place too", () => {
        const channels = [
            { id: 'U:me', cid: 'default', sid: 'busy', stereo: 'self', memberIds: [ME] },
        ] as DomainChannel[];

        expect(roomPlaces(channels, { placeIds: PLACES }).get('U:me')).toEqual(PLACES);
    });

    it('leaves my notes-to-self room unfiled while my places are unknown', () => {
        const channels = [
            { id: 'U:me', cid: 'cloud-1', sid: 'busy', stereo: 'self', memberIds: [ME] },
        ] as DomainChannel[];

        expect(roomPlaces(channels, { placeIds: [] }).has('U:me')).toBe(false);
    });
});

describe('listingPlaces', () => {
    const self = { id: 'U:me', cid: 'cloud-1', sid: 'busy', stereo: 'self', memberIds: [ME] } as DomainChannel;

    it('lists my notes-to-self room where roomPlaces filed it', () => {
        expect(listingPlaces(self, new Map([['U:me', PLACES]]))).toEqual(PLACES);
    });

    // Unfiled — before my places load — it keeps the place it is stamped with.
    it('falls back to its own place for a notes-to-self room that was not filed', () => {
        expect(listingPlaces(self, new Map())).toEqual(['busy']);
    });

    it('lists a cloud 1:1 in its own place, filed or not', () => {
        expect(listingPlaces(dm('dm-1', 'p1', 'hi'), new Map())).toEqual(['hi']);
        expect(listingPlaces(dm('dm-1', 'p1', 'hi'), new Map([['dm-1', PLACES]]))).toEqual(['hi']);
    });

    it('lists a 1:1 that names no place nowhere', () => {
        expect(listingPlaces(dm('me@p1', 'p1', ''), new Map())).toEqual([]);
    });

    it('lists a group channel in its own place only, whatever the filing says', () => {
        expect(listingPlaces(group('g', 'hi', [ME]), new Map([['g', PLACES]]))).toEqual(['hi']);
    });
});
