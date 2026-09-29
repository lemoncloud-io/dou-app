import type { DomainChannel } from '@chatic/data';
import { describe, expect, it } from 'vitest';

import { cloudDmPlaces } from './cloudDmPlaces';
import { placeMemberPeers } from './placeMemberPeers';

const ME = 'me';
const PLACES = ['place-a', 'place-b'];

const group = (id: string, sid: string, memberIds: string[], fields = {}): DomainChannel =>
    ({ id, name: id, cid: 'cloud-1', sid, stereo: 'private', memberIds, ...fields }) as unknown as DomainChannel;

const dm = (id: string, peerId: string, sid: string): DomainChannel =>
    ({ id, cid: 'cloud-1', sid, stereo: 'dm', memberIds: [ME, peerId] }) as DomainChannel;

const peersIn = (channels: DomainChannel[], placeId: string) =>
    placeMemberPeers(channels, {
        myUid: ME,
        placeId,
        dmPlaces: cloudDmPlaces(channels, { myUid: ME, placeIds: PLACES }),
    });

describe('placeMemberPeers', () => {
    it("lists everyone in the place's group channels once, without me", () => {
        const channels = [group('g1', 'place-a', [ME, 'p1', 'p2']), group('g2', 'place-a', [ME, 'p2', 'p3'])];

        expect(peersIn(channels, 'place-a')).toEqual([
            { peerId: 'p1', channelId: 'g1' },
            { peerId: 'p2', channelId: 'g1' },
            { peerId: 'p3', channelId: 'g2' },
        ]);
    });

    it('leaves out people who already have a 1:1 listed in the place', () => {
        const channels = [group('g1', 'place-a', [ME, 'p1', 'p2']), dm('dm-1', 'p1', 'place-b')];

        expect(peersIn(channels, 'place-a')).toEqual([{ peerId: 'p2', channelId: 'g1' }]);
    });

    it('leaves out members of other places', () => {
        const channels = [group('g1', 'place-a', [ME, 'p1']), group('g2', 'place-b', [ME, 'p9'])];

        expect(peersIn(channels, 'place-a')).toEqual([{ peerId: 'p1', channelId: 'g1' }]);
    });

    it('does not list my cloud-side id as a person', () => {
        const channels = [group('g1', 'place-a', ['cloud-me', 'p1'], { $join: { userId: 'cloud-me' } })];

        expect(peersIn(channels, 'place-a')).toEqual([{ peerId: 'p1', channelId: 'g1' }]);
    });
});
