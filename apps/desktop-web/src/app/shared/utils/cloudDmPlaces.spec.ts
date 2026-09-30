import type { DomainChannel } from '@chatic/data';
import { describe, expect, it } from 'vitest';

import { cloudDmPlaces, listingPlaces } from './cloudDmPlaces';

const ME = 'me';
const PLACES = ['busy', 'hi', 'again', 'rrrm'];

const group = (id: string, sid: string, memberIds: string[]): DomainChannel =>
    ({ id, name: id, cid: 'cloud-1', sid, stereo: 'private', memberIds }) as DomainChannel;

const dm = (id: string, peerId: string | null, sid = 'busy'): DomainChannel =>
    ({ id, cid: 'cloud-1', sid, stereo: 'dm', memberIds: peerId ? [ME, peerId] : undefined }) as DomainChannel;

describe('cloudDmPlaces', () => {
    // The shape measured on the test cloud: six 1:1s all stamped with the first place, one peer
    // also in a channel of the second place, nobody from them in the other two.
    it('lists each 1:1 only in the places where its peer shares a group channel with me', () => {
        const peers = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
        const channels = [
            group('invite demo', 'busy', [ME, 'p1', 'p2', 'p3']),
            group('hellfire', 'busy', [ME, 'p4', 'p5', 'p6']),
            group('bad bad', 'hi', [ME, 'p5', 'stranger']),
            group('rrm', 'rrrm', [ME, 'stranger']),
            ...peers.map(peer => dm(`dm-${peer}`, peer)),
        ];

        const listing = cloudDmPlaces(channels, { myUid: ME, placeIds: PLACES });

        const listedIn = (placeId: string) => [...listing].filter(([, places]) => places.includes(placeId)).length;
        expect([listedIn('busy'), listedIn('hi'), listedIn('again'), listedIn('rrrm')]).toEqual([6, 1, 0, 0]);
        expect(listing.get('dm-p5')).toEqual(['busy', 'hi']);
    });

    it('falls back to the stamped place when the peer shares no place with me', () => {
        const listing = cloudDmPlaces([dm('dm-1', 'loner', 'hi')], { myUid: ME, placeIds: PLACES });

        expect(listing.get('dm-1')).toEqual(['hi']);
    });

    it('lists the 1:1 in every place when its stamped place is not one of mine either', () => {
        const listing = cloudDmPlaces([dm('dm-1', 'loner', 'their-place')], { myUid: ME, placeIds: PLACES });

        expect(listing.get('dm-1')).toEqual(PLACES);
    });

    // A room startDm just returned can reach the cache before its members do.
    it('treats a 1:1 with no known peer like one that shares no place', () => {
        const listing = cloudDmPlaces([group('g', 'busy', [ME, 'p1']), dm('dm-1', null, 'hi')], {
            myUid: ME,
            placeIds: PLACES,
        });

        expect(listing.get('dm-1')).toEqual(['hi']);
    });

    it('does not mistake my cloud-side id for the peer', () => {
        const room = {
            ...dm('dm-1', 'p1'),
            memberIds: ['cloud-me', 'p1'],
            $join: { userId: 'cloud-me' },
        } as DomainChannel;
        const listing = cloudDmPlaces([group('g', 'hi', ['cloud-me', 'p1']), room], {
            myUid: ME,
            placeIds: PLACES,
        });

        expect(listing.get('dm-1')).toEqual(['hi']);
    });

    it('ignores group channels in places that are not mine', () => {
        const listing = cloudDmPlaces([group('g', 'elsewhere', [ME, 'p1']), dm('dm-1', 'p1', 'busy')], {
            myUid: ME,
            placeIds: PLACES,
        });

        expect(listing.get('dm-1')).toEqual(['busy']);
    });

    it('leaves relay 1:1s out', () => {
        const channels = [
            { id: 'relay-dm', cid: 'default', sid: 'busy', stereo: 'dm', memberIds: [ME, 'p1'] },
        ] as DomainChannel[];

        expect(cloudDmPlaces(channels, { myUid: ME, placeIds: PLACES }).size).toBe(0);
    });

    // The server keeps one notes-to-self room per person and returns it for every place, whichever
    // place it was created in.
    it('lists my notes-to-self room in every place', () => {
        const channels = [
            { id: 'U:me', cid: 'cloud-1', sid: 'busy', stereo: 'self', memberIds: [ME] },
        ] as DomainChannel[];

        expect(cloudDmPlaces(channels, { myUid: ME, placeIds: PLACES }).get('U:me')).toEqual(PLACES);
    });

    it("lists the relay's notes-to-self room in every place too", () => {
        const channels = [
            { id: 'U:me', cid: 'default', sid: 'busy', stereo: 'self', memberIds: [ME] },
        ] as DomainChannel[];

        expect(cloudDmPlaces(channels, { myUid: ME, placeIds: PLACES }).get('U:me')).toEqual(PLACES);
    });

    it('leaves my notes-to-self room unfiled while my places are unknown', () => {
        const channels = [
            { id: 'U:me', cid: 'cloud-1', sid: 'busy', stereo: 'self', memberIds: [ME] },
        ] as DomainChannel[];

        expect(cloudDmPlaces(channels, { myUid: ME, placeIds: [] }).has('U:me')).toBe(false);
    });
});

describe('listingPlaces', () => {
    const self = { id: 'U:me', cid: 'cloud-1', sid: 'busy', stereo: 'self', memberIds: [ME] } as DomainChannel;

    it('lists my notes-to-self room where cloudDmPlaces filed it', () => {
        expect(listingPlaces(self, new Map([['U:me', PLACES]]))).toEqual(PLACES);
    });

    // Unfiled — before my places load — it keeps the place it is stamped with.
    it('falls back to its own place for a notes-to-self room that was not filed', () => {
        expect(listingPlaces(self, new Map())).toEqual(['busy']);
    });

    it('lists a cloud 1:1 nowhere until it is filed', () => {
        expect(listingPlaces(dm('dm-1', 'p1'), new Map())).toEqual([]);
    });

    it('lists a group channel in its own place only, whatever the filing says', () => {
        expect(listingPlaces(group('g', 'hi', [ME]), new Map([['g', PLACES]]))).toEqual(['hi']);
    });
});
