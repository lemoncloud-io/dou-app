import { renderHook } from '@testing-library/react';

import type { DomainChannel, DomainProfile } from '@chatic/data';

import { LIST_PROFILE_SYNC_INTERVAL_MS, useDmPeers } from './useDmPeers';

// The list-level profile subscription is the collaborator under contract here: we assert what ids it
// is asked for (exactly once, deduped) and feed its map back through.
const useChannelProfiles = jest.fn();
jest.mock('./useChannelProfiles', () => ({
    useChannelProfiles: (...args: unknown[]) => useChannelProfiles(...args),
}));

const channel = (id: string, fields: Partial<DomainChannel>): DomainChannel => ({ id, ...fields }) as DomainChannel;

const withProfiles = (entries: Array<[string, Partial<DomainProfile>]> = []) => {
    useChannelProfiles.mockReturnValue({
        profileMap: new Map(entries.map(([id, p]) => [id, p as DomainProfile])),
    });
};

describe('useDmPeers', () => {
    beforeEach(() => {
        useChannelProfiles.mockReset();
        withProfiles();
    });

    it('maps each DM channel to the roster member that is not me', () => {
        const { result } = renderHook(() =>
            useDmPeers(
                'sid',
                [
                    channel('c1', { stereo: 'dm', memberIds: ['me', 'peer1'] }),
                    channel('c2', { stereo: 'dm', memberIds: ['peer2', 'me'] }),
                ],
                'me'
            )
        );

        expect(result.current.get('c1')?.id).toBe('peer1');
        expect(result.current.get('c2')?.id).toBe('peer2');
    });

    it('holds DM channels only', () => {
        const { result } = renderHook(() =>
            useDmPeers(
                'sid',
                [
                    channel('dm', { stereo: 'dm', memberIds: ['me', 'peer'] }),
                    channel('group', { stereo: 'private', memberIds: ['me', 'other'] }),
                    channel('self', { stereo: 'self', memberIds: ['me'] }),
                ],
                'me'
            )
        );

        expect(result.current.has('dm')).toBe(true);
        expect(result.current.has('group')).toBe(false);
        expect(result.current.has('self')).toBe(false);
    });

    it('subscribes profiles once for the deduped peer ids', () => {
        renderHook(() =>
            useDmPeers(
                'sid',
                [
                    channel('c1', { stereo: 'dm', memberIds: ['me', 'peer1'] }),
                    channel('c2', { stereo: 'dm', memberIds: ['me', 'peer1'] }),
                    channel('c3', { stereo: 'dm', memberIds: ['me', 'peer2'] }),
                ],
                'me'
            )
        );

        expect(useChannelProfiles).toHaveBeenCalledTimes(1);
        expect(useChannelProfiles).toHaveBeenCalledWith('sid', ['peer1', 'peer2'], LIST_PROFILE_SYNC_INTERVAL_MS);
    });

    it('fills nick/thumbnail from the profile map', () => {
        withProfiles([['peer', { nick: '토끼', thumbnail: 'profile.png' }]]);

        const { result } = renderHook(() =>
            useDmPeers('sid', [channel('c1', { stereo: 'dm', memberIds: ['me', 'peer'] })], 'me')
        );

        expect(result.current.get('c1')).toMatchObject({ id: 'peer', profileNick: '토끼', thumbnail: 'profile.png' });
    });

    it('leaves profileNick undefined when the peer has no profile yet', () => {
        const { result } = renderHook(() =>
            useDmPeers('sid', [channel('c1', { stereo: 'dm', memberIds: ['me', 'peer'] })], 'me')
        );

        expect(result.current.get('c1')?.profileNick).toBeUndefined();
    });

    // Without a userId guard, `id !== userId` is vacuously true and the first roster entry — usually
    // me, since the inviter owns the channel — becomes the "peer": my own name and avatar as the
    // person I am talking to. Reachable on a cold render before the session token is restored.
    it('resolves no peers while my own user id is unknown', () => {
        const { result } = renderHook(() =>
            useDmPeers('sid', [channel('c1', { stereo: 'dm', memberIds: ['me', 'peer'] })], null)
        );

        expect(result.current.size).toBe(0);
        expect(useChannelProfiles).toHaveBeenCalledWith('sid', [], LIST_PROFILE_SYNC_INTERVAL_MS);
    });

    // The design claim is ONE subscription with no churn: a re-render with an equal-but-new channels
    // array must not hand useChannelProfiles a different id list (which would dispose and
    // re-register every profile sync target). Dropping either useMemo makes this fail.
    it('keeps the subscribed id list stable across re-renders with equal input', () => {
        const channels = () => [
            channel('c1', { stereo: 'dm', memberIds: ['me', 'peer2'] }),
            channel('c2', { stereo: 'dm', memberIds: ['me', 'peer1'] }),
        ];
        const { rerender } = renderHook(({ list }) => useDmPeers('sid', list, 'me'), {
            initialProps: { list: channels() },
        });
        const first = useChannelProfiles.mock.calls.at(-1)?.[1];

        rerender({ list: channels() });
        const second = useChannelProfiles.mock.calls.at(-1)?.[1];

        // Sorted, so roster/channel order can never reshuffle the order-sensitive registration key.
        expect(first).toEqual(['peer1', 'peer2']);
        expect(second).toEqual(first);
    });

    it('skips a DM whose roster holds nobody but me', () => {
        const { result } = renderHook(() =>
            useDmPeers('sid', [channel('c1', { stereo: 'dm', memberIds: ['me'] })], 'me')
        );

        expect(result.current.size).toBe(0);
        expect(useChannelProfiles).toHaveBeenCalledWith('sid', [], LIST_PROFILE_SYNC_INTERVAL_MS);
    });
});
