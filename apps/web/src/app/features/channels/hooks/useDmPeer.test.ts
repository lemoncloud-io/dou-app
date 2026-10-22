import { renderHook } from '@testing-library/react';

import type { DomainProfile } from '@chatic/data';

import type { ChannelMember, ClientChannelView } from '../types';
import { useDmPeer } from './useDmPeer';

const channel = (fields: Partial<ClientChannelView>): ClientChannelView => ({ ...fields }) as ClientChannelView;
const member = (id: string, fields: Partial<ChannelMember> = {}): ChannelMember => ({ id, ...fields }) as ChannelMember;
const profileMap = (entries: Array<[string, Partial<DomainProfile>]>) =>
    new Map(entries.map(([id, p]) => [id, p as DomainProfile]));

describe('useDmPeer', () => {
    it('returns null for non-DM channels', () => {
        const { result } = renderHook(() =>
            useDmPeer(channel({ stereo: 'public', memberIds: ['me', 'peer'] }), [], new Map(), 'me')
        );
        expect(result.current).toBeNull();
    });

    it('picks the roster member that is not me', () => {
        const { result } = renderHook(() =>
            useDmPeer(
                channel({ stereo: 'dm', memberIds: ['me', 'peer'] }),
                [member('me'), member('peer', { name: 'Peer' })],
                new Map(),
                'me'
            )
        );
        expect(result.current?.id).toBe('peer');
    });

    it('takes the nick and thumbnail from the site profile', () => {
        const { result } = renderHook(() =>
            useDmPeer(
                channel({ stereo: 'dm', memberIds: ['me', 'peer'] }),
                [member('peer', { name: 'Cache Name', thumbnail: 'cache.png' })],
                profileMap([['peer', { nick: 'Profile Nick', thumbnail: 'profile.png' }]]),
                'me'
            )
        );
        expect(result.current).toMatchObject({ id: 'peer', profileNick: 'Profile Nick', thumbnail: 'profile.png' });
    });

    // The member's own record is a separate field, not folded into profileNick: only a cloud 1:1's
    // title reads it, so a relay title must still see "no profile" here.
    it('leaves profileNick undefined when no profile is cached', () => {
        const { result } = renderHook(() =>
            useDmPeer(
                channel({ stereo: 'dm', memberIds: ['me', 'peer'] }),
                [member('peer', { name: 'Cache Name', nick: 'Cache Nick' })],
                new Map(),
                'me'
            )
        );
        expect(result.current).toMatchObject({ id: 'peer' });
        expect(result.current?.profileNick).toBeUndefined();
    });

    it("takes the cloud-profile name from the peer's member record, nick first", () => {
        const { result } = renderHook(() =>
            useDmPeer(
                channel({ stereo: 'dm', memberIds: ['me', 'peer'] }),
                [member('me', { name: 'Me' }), member('peer', { name: '임마', nick: '토끼' })],
                new Map(),
                'me'
            )
        );
        expect(result.current?.cloudName).toBe('토끼');
    });

    it('gives no cloud-profile name for a generated account name or a peer not loaded yet', () => {
        const generated = renderHook(() =>
            useDmPeer(
                channel({ stereo: 'dm', memberIds: ['me', 'peer'] }),
                [member('peer', { name: '***0101' })],
                new Map(),
                'me'
            )
        );
        expect(generated.result.current?.cloudName).toBeUndefined();

        const notLoaded = renderHook(() =>
            useDmPeer(channel({ stereo: 'dm', memberIds: ['me', 'peer'] }), [], new Map(), 'me')
        );
        expect(notLoaded.result.current?.cloudName).toBeUndefined();
    });

    // A profile is per-place: the account-wide avatar is not a photo the peer chose for this place.
    it('leaves thumbnail undefined when no profile photo is cached', () => {
        const { result } = renderHook(() =>
            useDmPeer(
                channel({ stereo: 'dm', memberIds: ['me', 'peer'] }),
                [member('peer', { thumbnail: 'cache.png' })],
                new Map(),
                'me'
            )
        );
        expect(result.current?.thumbnail).toBeUndefined();
    });

    it('resolves the peer from the member list when the roster is empty', () => {
        const { result } = renderHook(() =>
            useDmPeer(channel({ stereo: 'dm' }), [member('me'), member('peer', { name: 'Peer' })], new Map(), 'me')
        );
        expect(result.current?.id).toBe('peer');
    });

    it('returns null when no peer can be found', () => {
        const { result } = renderHook(() =>
            useDmPeer(channel({ stereo: 'dm', memberIds: ['me'] }), [member('me')], new Map(), 'me')
        );
        expect(result.current).toBeNull();
    });
});
