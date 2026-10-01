import { describe, expect, it } from 'vitest';

import { elsewhereChannels } from './elsewhereChannels';

const placeName = new Map([
    ['place-a', 'Alpha'],
    ['place-b', 'Beta'],
    ['place-c', 'Gamma'],
]);
const entry = (placeId: string, channelId: string, name: string, peerId?: string) => ({
    channelId,
    placeId,
    name,
    seenAt: 1,
    ...(peerId ? { peerId } : {}),
});
const peerName = (peerId: string) => ({ 'u-1': 'Aiden' })[peerId] ?? '';

describe('elsewhereChannels', () => {
    it("offers other places' channels with their place's name", () => {
        const known = { 'place-b:ch-1': entry('place-b', 'ch-1', 'design') };

        expect(elsewhereChannels(known, { placeId: 'place-a', placeName, listedIds: new Set(), peerName })).toEqual([
            { channelId: 'ch-1', name: 'design', placeId: 'place-b', placeName: 'Beta' },
        ]);
    });

    // A 1:1 is filed under every place that lists it, and its room name is only what the server set.
    it('offers a 1:1 from another place once, named after the person', () => {
        const known = {
            'place-b:dm-1': entry('place-b', 'dm-1', 'room-name', 'u-1'),
            'place-c:dm-1': entry('place-c', 'dm-1', 'room-name', 'u-1'),
        };

        expect(elsewhereChannels(known, { placeId: 'place-a', placeName, listedIds: new Set(), peerName })).toEqual([
            { channelId: 'dm-1', name: 'Aiden', placeId: 'place-b', placeName: 'Beta' },
        ]);
    });

    it('leaves out a 1:1 this place already lists', () => {
        const known = { 'place-b:dm-1': entry('place-b', 'dm-1', '', 'u-1') };

        expect(
            elsewhereChannels(known, { placeId: 'place-a', placeName, listedIds: new Set(['dm-1']), peerName })
        ).toEqual([]);
    });

    // Channel ids repeat across places, so a group elsewhere is not the one listed here.
    // My notes-to-self room is filed under every place that lists it, like a 1:1.
    it('leaves out my notes-to-self room when this place lists it, and offers it once otherwise', () => {
        const self = (placeId: string) => ({ ...entry(placeId, 'U:me', '#self'), self: true });
        const known = { 'place-b:U:me': self('place-b'), 'place-c:U:me': self('place-c') };

        expect(
            elsewhereChannels(known, { placeId: 'place-a', placeName, listedIds: new Set(['U:me']), peerName })
        ).toEqual([]);
        expect(
            elsewhereChannels(known, { placeId: 'place-a', placeName, listedIds: new Set(), peerName })
        ).toHaveLength(1);
    });

    it('keeps a group elsewhere whose id matches one listed here', () => {
        const known = { 'place-b:ch-1': entry('place-b', 'ch-1', 'design') };

        expect(
            elsewhereChannels(known, { placeId: 'place-a', placeName, listedIds: new Set(['ch-1']), peerName })
        ).toHaveLength(1);
    });

    // Only an opened room loads its members, so a 1:1 in a place not visited yet may have no name.
    it('names a 1:1 by its room until the person is known, and drops a row with no name at all', () => {
        const known = {
            'place-b:dm-2': entry('place-b', 'dm-2', 'room-name', 'u-unknown'),
            'place-b:dm-3': entry('place-b', 'dm-3', '', 'u-unknown'),
            'place-x:ch-9': entry('place-x', 'ch-9', 'old'),
        };

        expect(elsewhereChannels(known, { placeId: 'place-a', placeName, listedIds: new Set(), peerName })).toEqual([
            { channelId: 'dm-2', name: 'room-name', placeId: 'place-b', placeName: 'Beta' },
        ]);
    });

    it('offers a 1:1 under the place it was filed under last', () => {
        const known = {
            'place-b:dm-1': { ...entry('place-b', 'dm-1', '', 'u-1'), seenAt: 1 },
            'place-c:dm-1': { ...entry('place-c', 'dm-1', '', 'u-1'), seenAt: 2 },
        };

        expect(
            elsewhereChannels(known, { placeId: 'place-a', placeName, listedIds: new Set(), peerName })[0]?.placeId
        ).toBe('place-c');
    });
});
