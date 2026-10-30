import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainChannel, DomainJoin } from '@chatic/data';

const session = vi.hoisted(() => ({ uids: {} as Record<string, string | null>, verifiedSlots: new Set<string>() }));
const registerJoin = vi.fn();
const joinObservers = vi.hoisted(() => new Map<string, (result: { list: DomainJoin[] } | null) => void>());

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                join: {
                    observeList: (
                        payload: { channelId: string },
                        callback: (result: { list: DomainJoin[] } | null) => void
                    ) => {
                        joinObservers.set(payload.channelId, callback);
                        return () => joinObservers.delete(payload.channelId);
                    },
                },
            }),
        },
        connection: { useCloudVerified: (cid: string) => session.verifiedSlots.has(cid) },
        session: { useUidInCloud: (cid: string) => session.uids[cid] ?? null },
        sync: { getSyncManager: () => ({ registerJoin }) },
    },
}));

import { useChannelReadCounts } from './useChannelReadCounts';

const GROUP = { id: 'C1', cid: 'cloud-a', stereo: 'public', memberIds: ['me', 'ada', 'bob'] } as DomainChannel;

const join = (userId: string, chatNo: number, extra: Partial<DomainJoin> = {}): DomainJoin =>
    ({ id: `C1@${userId}`, channelId: 'C1', userId, chatNo, joined: 1, ...extra }) as DomainJoin;

const emitJoins = (joins: DomainJoin[]) => act(() => joinObservers.get('C1')?.({ list: joins }));

let registrations: { id: string; cid?: string; disposed: boolean }[] = [];
const liveJoins = () => registrations.filter(entry => !entry.disposed).map(entry => entry.id);

describe('useChannelReadCounts', () => {
    beforeEach(() => {
        session.uids = { 'cloud-a': 'me' };
        session.verifiedSlots = new Set(['cloud-a']);
        joinObservers.clear();
        registrations = [];
        registerJoin.mockReset().mockImplementation((id: string, _interval?: number, options?: { cid?: string }) => {
            const entry = { id, cid: options?.cid, disposed: false };
            registrations.push(entry);
            return () => {
                entry.disposed = true;
            };
        });
    });

    it('counts active members whose read cursor reached the message', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 10), join('ada', 7), join('bob', 3)]);

        expect(result.current(7)).toEqual({ read: 2, unread: 1 });
        expect(result.current(10)).toEqual({ read: 1, unread: 2 });
    });

    it('takes the further of readNo and chatNo as a member’s cursor', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 2, { readNo: 9 }), join('ada', 9)]);

        expect(result.current(9)).toEqual({ read: 2, unread: 0 });
    });

    it('leaves a member who has left out of both counts', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 5), join('ada', 5), join('bob', 0, { joined: 0 })]);

        expect(result.current(5)).toEqual({ read: 2, unread: 0 });
    });

    it('counts a member on neither side until their join row arrives', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 5), join('ada', 5)]);

        expect(result.current(5)).toEqual({ read: 2, unread: 0 });
    });

    it('does not count the last room’s rows against the room switched to', () => {
        const { result, rerender } = renderHook(({ channel }) => useChannelReadCounts(channel), {
            initialProps: { channel: GROUP },
        });
        emitJoins([join('me', 9), join('ada', 9)]);
        rerender({ channel: { ...GROUP, id: 'C2' } as DomainChannel });

        expect(result.current(9)).toBeNull();
    });

    it('has no count before any join row has arrived', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));

        expect(result.current(1)).toBeNull();
    });

    it('has no count in a room with fewer than two members', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 5)]);

        expect(result.current(5)).toBeNull();
    });

    it('has no count in my notes-to-self channel', () => {
        const self = { ...GROUP, stereo: 'self' } as DomainChannel;
        const { result } = renderHook(() => useChannelReadCounts(self));
        emitJoins([join('me', 5), join('ada', 5)]);

        expect(result.current(5)).toBeNull();
    });

    it('keeps every member’s cursor syncing while the room is open, in the room’s cloud', () => {
        const { unmount } = renderHook(() => useChannelReadCounts(GROUP));

        expect(liveJoins()).toEqual(['C1@me', 'C1@ada', 'C1@bob']);
        expect(registrations.every(entry => entry.cid === 'cloud-a')).toBe(true);
        unmount();
        expect(liveJoins()).toEqual([]);
    });

    it('polls nobody in a room I am not a member of', () => {
        const stranger = { ...GROUP, memberIds: ['ada', 'bob'] } as DomainChannel;
        renderHook(() => useChannelReadCounts(stranger));

        expect(liveJoins()).toEqual([]);
    });

    it('polls nobody until the room’s cloud is verified', () => {
        session.verifiedSlots = new Set();
        renderHook(() => useChannelReadCounts(GROUP));

        expect(liveJoins()).toEqual([]);
    });
});
