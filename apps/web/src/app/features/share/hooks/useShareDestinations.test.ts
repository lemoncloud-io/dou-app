import { renderHook } from '@testing-library/react';

import { matchDestinations, useShareDestinations, type ShareDestination } from './useShareDestinations';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'cloud-a', selectedSiteId: 'place-1' }),
            useSessionIdentity: () => ({ userId: 'me' }),
        },
    },
}));
let mockPlaceChannels: Array<Record<string, unknown>>;
let mockSelfChannels: Array<Record<string, unknown>>;
jest.mock('../../../hooks', () => ({
    useHomeChannels: () => ({ channels: mockPlaceChannels, isLoading: false }),
    useActiveCloudData: () => ({ myJoins: new Map() }),
    useMyProfile: () => ({ profile: { nick: 'Me', thumbnail: 'me.png' } }),
}));
jest.mock('../../channels/hooks', () => ({
    useCloudSelfChannels: () => ({ channels: mockSelfChannels, isLoading: false }),
    useDmPeers: () => new Map([['dm-1', { id: 'alice', profileNick: 'Alice', thumbnail: 'alice.png' }]]),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
    mockSelfChannels = [{ id: 'self', cid: 'cloud-a', stereo: 'self', ownerId: 'me', memberIds: ['me'] }];
    mockPlaceChannels = [
        { id: 'ch-1', cid: 'cloud-a', sid: 'place-1', stereo: 'public', name: 'General' },
        { id: 'dm-1', cid: 'cloud-a', sid: 'place-1', stereo: 'dm', memberIds: ['me', 'alice'] },
        { id: 'ch-2', sid: 'place-1', stereo: 'private', name: 'Design' },
        // Another account's notes-to-self, left over from the previous sign-in.
        { id: 'self-old', cid: 'default', sid: 'place-1', stereo: 'self', ownerId: 'someone-else' },
    ];
});

describe('useShareDestinations', () => {
    it("lists notes-to-self, then 1:1s, then the place's rooms, named and pictured as home shows them", () => {
        const { result } = renderHook(() => useShareDestinations());

        expect(
            result.current.destinations.map(({ id, kind, title, avatarSrc }) => ({ id, kind, title, avatarSrc }))
        ).toEqual([
            { id: 'self', kind: 'self', title: 'Me', avatarSrc: 'me.png' },
            { id: 'dm-1', kind: 'dm', title: 'Alice', avatarSrc: 'alice.png' },
            { id: 'ch-1', kind: 'group', title: 'General', avatarSrc: undefined },
            { id: 'ch-2', kind: 'group', title: 'Design', avatarSrc: undefined },
        ]);
    });

    it("sends a room with no cloud on record to the session's cloud", () => {
        const { result } = renderHook(() => useShareDestinations());

        expect(result.current.destinations.find(destination => destination.id === 'ch-2')?.cid).toBe('cloud-a');
    });

    it('carries the row each destination was drawn from, for the room to open with', () => {
        const { result } = renderHook(() => useShareDestinations());

        expect(result.current.destinations.find(destination => destination.id === 'self')?.channel).toBe(
            mockSelfChannels[0]
        );
    });
});

describe('matchDestinations', () => {
    const rooms = [
        { id: 'a', title: 'General' },
        { id: 'b', title: 'Design' },
    ] as ShareDestination[];

    it('keeps the rooms whose name holds the query, ignoring case', () => {
        expect(matchDestinations(rooms, ' gen ')).toEqual([rooms[0]]);
    });

    it('keeps every room for a blank query', () => {
        expect(matchDestinations(rooms, '  ')).toEqual(rooms);
    });
});
