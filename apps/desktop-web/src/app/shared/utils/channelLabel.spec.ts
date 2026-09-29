import { describe, expect, it } from 'vitest';

import type { DomainChannel } from '@chatic/data';

import { bareChannelName, channelLabel, channelRef, cloudLabel } from './channelLabel';

const context = {
    myUid: 'me',
    names: new Map([['u-lemon', '레몽']]),
    placeProfiles: {},
    selfLabel: 'You',
};

describe('channelLabel', () => {
    it('names a channel without the hash its name was typed with', () => {
        expect(channelLabel({ id: 'C1', name: '#1' } as DomainChannel, context)).toBe('1');
    });

    it('names a DM by the other person, not the room', () => {
        const dm = { id: 'D1', stereo: 'dm', name: '1000002@1000192', memberIds: ['me', 'u-lemon'] } as DomainChannel;
        expect(channelLabel(dm, context)).toBe('레몽');
    });

    it('lets a Place Profile nick win over the cached name', () => {
        const dm = { id: 'D1', stereo: 'dm', memberIds: ['me', 'u-lemon'] } as DomainChannel;
        const withNick = { ...context, placeProfiles: { 'u-lemon': { nick: 'Lemon' } } };
        expect(channelLabel(dm, withNick)).toBe('Lemon');
    });

    it('falls back to the room name for a DM whose person is not cached', () => {
        const dm = { id: 'D1', stereo: 'dm', name: 'pair', memberIds: ['me', 'u-other'] } as DomainChannel;
        expect(channelLabel(dm, context)).toBe('pair');
    });

    it('calls the self channel by the self label', () => {
        expect(channelLabel({ id: 'S1', stereo: 'self', name: '#self' } as DomainChannel, context)).toBe('You');
    });

    it('falls back to the id for a channel with no name', () => {
        expect(channelLabel({ id: 'C9', stereo: 'public' } as DomainChannel, context)).toBe('C9');
    });
});

describe('bareChannelName', () => {
    it('strips every leading hash and the space around the name', () => {
        expect(bareChannelName('## general ')).toBe('general');
        expect(bareChannelName(undefined)).toBe('');
    });
});

describe('channelRef', () => {
    it('puts the hash on channels only', () => {
        expect(channelRef('channel', 'general')).toBe('#general');
        expect(channelRef('dm', '레몽')).toBe('레몽');
    });
});

describe('cloudLabel', () => {
    it('keeps a name a person gave the cloud', () => {
        expect(cloudLabel({ id: '1', name: ' Studio ' }, 'Untitled')).toBe('Studio');
    });

    it('treats the server-generated setup name and a missing name as untitled', () => {
        expect(cloudLabel({ id: '1', name: '#cloud/1001494/3' }, 'Untitled')).toBe('Untitled');
        expect(cloudLabel({ id: '1000006' }, 'Untitled')).toBe('Untitled');
    });
});
