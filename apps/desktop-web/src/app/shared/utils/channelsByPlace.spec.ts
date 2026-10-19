import type { DomainChannel } from '@chatic/data';
import { describe, expect, it } from 'vitest';

import { channelsByPlace } from './channelsByPlace';
import { roomPlaces } from './roomPlaces';

const ids = (map: Map<string, DomainChannel[]>) =>
    Object.fromEntries([...map].map(([placeId, list]) => [placeId, list.map(c => c.id)]));

describe('channelsByPlace', () => {
    it('files a group and a cloud 1:1 under their own place, and my notes-to-self room under each', () => {
        const channels = [
            { id: 'g-1', cid: 'cloud-1', sid: 'place-a', stereo: 'private' },
            { id: 'place-a@me@p1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' },
            { id: 'U:me', cid: 'cloud-1', sid: 'place-a', stereo: 'self' },
        ] as DomainChannel[];

        expect(ids(channelsByPlace(channels, roomPlaces(channels, { placeIds: ['place-a', 'place-b'] })))).toEqual({
            'place-a': ['g-1', 'place-a@me@p1', 'U:me'],
            'place-b': ['U:me'],
        });
    });

    // One person, two places: two rooms, each in its own place.
    it('files the 1:1s with one person in two places each under its own place', () => {
        const channels = [
            { id: 'place-a@me@p1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' },
            { id: 'place-b@me@p1', cid: 'cloud-1', sid: 'place-b', stereo: 'dm' },
        ] as DomainChannel[];

        expect(ids(channelsByPlace(channels, roomPlaces(channels, { placeIds: ['place-a', 'place-b'] })))).toEqual({
            'place-a': ['place-a@me@p1'],
            'place-b': ['place-b@me@p1'],
        });
    });

    it('files a room that names no place nowhere', () => {
        const channels = [
            { id: 'g-1', cid: 'cloud-1', sid: '', stereo: 'private' },
            { id: 'me@p1', cid: 'cloud-1', sid: '', stereo: 'dm' },
        ] as DomainChannel[];

        expect(channelsByPlace(channels, new Map()).size).toBe(0);
    });
});
