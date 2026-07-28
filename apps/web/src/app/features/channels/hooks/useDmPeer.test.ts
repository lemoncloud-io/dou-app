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

    it('prefers the site profile nick/thumbnail over the member cache', () => {
        const { result } = renderHook(() =>
            useDmPeer(
                channel({ stereo: 'dm', memberIds: ['me', 'peer'] }),
                [member('peer', { name: 'Cache Name', thumbnail: 'cache.png' })],
                profileMap([['peer', { nick: 'Profile Nick', thumbnail: 'profile.png' }]]),
                'me'
            )
        );
        expect(result.current).toMatchObject({ id: 'peer', nick: 'Profile Nick', thumbnail: 'profile.png' });
    });

    it('falls back to the member-cache name when no profile is cached', () => {
        const { result } = renderHook(() =>
            useDmPeer(
                channel({ stereo: 'dm', memberIds: ['me', 'peer'] }),
                [member('peer', { name: 'Cache Name' })],
                new Map(),
                'me'
            )
        );
        expect(result.current).toMatchObject({ id: 'peer', nick: 'Cache Name' });
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
