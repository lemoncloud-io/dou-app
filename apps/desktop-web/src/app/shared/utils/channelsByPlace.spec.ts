import type { DomainChannel } from '@chatic/data';
import { describe, expect, it } from 'vitest';

import { channelsByPlace } from './channelsByPlace';

const ids = (map: Map<string, DomainChannel[]>) =>
    Object.fromEntries([...map].map(([placeId, list]) => [placeId, list.map(c => c.id)]));

describe('channelsByPlace', () => {
    it('files a group under its place and a cloud 1:1 under each place listing it', () => {
        const channels = [
            { id: 'g-1', cid: 'cloud-1', sid: 'place-a', stereo: 'private' },
            { id: 'dm-1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' },
        ] as DomainChannel[];

        expect(ids(channelsByPlace(channels, new Map([['dm-1', ['place-b', 'place-c']]])))).toEqual({
            'place-a': ['g-1'],
            'place-b': ['dm-1'],
            'place-c': ['dm-1'],
        });
    });

    it('files a 1:1 nowhere until it is placed, and a group with no place nowhere', () => {
        const channels = [
            { id: 'g-1', cid: 'cloud-1', sid: '', stereo: 'private' },
            { id: 'dm-1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' },
        ] as DomainChannel[];

        expect(channelsByPlace(channels, new Map()).size).toBe(0);
    });
});
