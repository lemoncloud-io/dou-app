import { renderHook } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';

import { useChannelProfiles } from '../../channels/hooks/useChannelProfiles';
import { useLastChatSenders } from './useLastChatSenders';

jest.mock('../../channels/hooks/useChannelProfiles', () => ({ useChannelProfiles: jest.fn() }));
// The list cadence lives beside useDmPeers; importing that module for real pulls the cloud-name hook.
jest.mock('../../channels/hooks/useDmPeers', () => ({ LIST_PROFILE_SYNC_INTERVAL_MS: 60_000 }));

const useChannelProfilesMock = useChannelProfiles as jest.Mock;

const channel = (id: string, stereo: DomainChannel['stereo']) => ({ id, stereo }) as DomainChannel;
const chat = (ownerId: string, name?: string) =>
    ({ ownerId, owner$: name === undefined ? undefined : { name } }) as unknown as DomainChat;

const setProfiles = (nicks: Record<string, string>) =>
    useChannelProfilesMock.mockReturnValue({
        profileMap: new Map(Object.entries(nicks).map(([id, nick]) => [id, { nick }])),
    });

beforeEach(() => {
    jest.clearAllMocks();
    setProfiles({});
});

describe('useLastChatSenders', () => {
    it("names a group row's sender by their place profile first", () => {
        setProfiles({ u1: 'Place Nick' });
        const channels = [channel('g1', 'public')];

        const { result } = renderHook(() =>
            useLastChatSenders('S1', channels, new Map([['g1', chat('u1', 'Account Name')]]))
        );

        expect(result.current.get('g1')).toBe('Place Nick');
    });

    it('falls back to the name the chat row carries', () => {
        const channels = [channel('g1', 'private')];

        const { result } = renderHook(() =>
            useLastChatSenders('S1', channels, new Map([['g1', chat('u1', 'Account Name')]]))
        );

        expect(result.current.get('g1')).toBe('Account Name');
    });

    it('leaves out a sender with no readable name', () => {
        const channels = [channel('g1', 'public'), channel('g2', 'public')];
        const uuid = 'f7fa3ac3-50e9-425c-b8d5-a6214b9dee50';

        const { result } = renderHook(() =>
            useLastChatSenders(
                'S1',
                channels,
                new Map([
                    ['g1', chat('u1')],
                    ['g2', chat(uuid, uuid)],
                ])
            )
        );

        expect(result.current.has('g1')).toBe(false);
        expect(result.current.has('g2')).toBe(false);
    });

    it('reads no sender for a 1:1 or a self chat', () => {
        setProfiles({ u1: 'Nick' });
        const channels = [channel('d1', 'dm'), channel('s1', 'self')];

        const { result } = renderHook(() =>
            useLastChatSenders(
                'S1',
                channels,
                new Map([
                    ['d1', chat('u1', 'A')],
                    ['s1', chat('u1', 'A')],
                ])
            )
        );

        expect(result.current.size).toBe(0);
        expect(useChannelProfilesMock).toHaveBeenLastCalledWith('S1', [], 60_000);
    });

    it('asks for every sender through one subscription, deduped and sorted', () => {
        const channels = [channel('g1', 'public'), channel('g2', 'public'), channel('g3', 'public')];

        renderHook(() =>
            useLastChatSenders(
                'S1',
                channels,
                new Map([
                    ['g1', chat('u2', 'B')],
                    ['g2', chat('u1', 'A')],
                    ['g3', chat('u2', 'B')],
                ])
            )
        );

        expect(useChannelProfilesMock).toHaveBeenCalledTimes(1);
        expect(useChannelProfilesMock).toHaveBeenCalledWith('S1', ['u1', 'u2'], 60_000);
    });
});
