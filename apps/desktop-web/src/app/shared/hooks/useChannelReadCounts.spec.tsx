import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainChannel, DomainJoin } from '@chatic/data';

const session = vi.hoisted(() => ({ uids: {} as Record<string, string | null>, verifiedSlots: new Set<string>() }));
const registerSyncTarget = vi.fn();
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
        sync: { registerSyncTarget: (...args: unknown[]) => registerSyncTarget(...args) },
    },
}));

import { useChannelReadCounts } from './useChannelReadCounts';

const GROUP = { id: 'C1', cid: 'cloud-a', stereo: 'public', memberIds: ['me', 'ada', 'bob'] } as DomainChannel;

const join = (userId: string, chatNo: number, extra: Partial<DomainJoin> = {}): DomainJoin =>
    ({ id: `C1@${userId}`, channelId: 'C1', userId, chatNo, joined: 1, ...extra }) as DomainJoin;

const emitJoins = (joins: DomainJoin[]) => act(() => joinObservers.get('C1')?.({ list: joins }));

let registrations: { type: string; id: string; cid?: string; disposed: boolean }[] = [];
const liveJoins = () => registrations.filter(entry => entry.type === 'join' && !entry.disposed).map(entry => entry.id);

describe('useChannelReadCounts', () => {
    beforeEach(() => {
        session.uids = { 'cloud-a': 'me' };
        session.verifiedSlots = new Set(['cloud-a']);
        joinObservers.clear();
        registrations = [];
        registerSyncTarget
            .mockReset()
            .mockImplementation((target: { type: string; id: string }, options?: { cid?: string }) => {
                const entry = { type: target.type, id: target.id, cid: options?.cid, disposed: false };
                registrations.push(entry);
                return () => {
                    entry.disposed = true;
                };
            });
    });

    it('splits the active members other than the author by whether their cursor reached the message', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 10), join('ada', 7), join('bob', 3), join('cy', 7)]);

        expect(result.current.readCountOf(7, 'cy')).toEqual({ readIds: ['me', 'ada'], unreadIds: ['bob'] });
        expect(result.current.readCountOf(10, 'cy')).toEqual({ readIds: ['me'], unreadIds: ['ada', 'bob'] });
    });

    it('leaves the author out of their own message, read or not', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 9), join('ada', 9), join('bob', 2)]);

        expect(result.current.readCountOf(9, 'me')).toEqual({ readIds: ['ada'], unreadIds: ['bob'] });
        expect(result.current.readCountOf(9, 'bob')).toEqual({ readIds: ['me', 'ada'], unreadIds: [] });
    });

    it('leaves a member who joined after the message out of both lists', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        // Joining writes the latest number into chatNo too, so without joinedNo Bob would read as seen.
        emitJoins([join('me', 9), join('ada', 4), join('bob', 9, { joinedNo: 6 })]);

        expect(result.current.readCountOf(6, 'me')).toEqual({ readIds: [], unreadIds: ['ada'] });
        expect(result.current.readCountOf(7, 'me')).toEqual({ readIds: ['bob'], unreadIds: ['ada'] });
    });

    it('treats a row with no joinedNo as having been in the room all along', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 9), join('ada', 9, { joinedNo: 0 }), join('bob', 9)]);

        expect(result.current.readCountOf(1, 'me')).toEqual({ readIds: ['ada', 'bob'], unreadIds: [] });
    });

    it('takes the further of readNo and chatNo as a member’s cursor', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 2, { readNo: 9 }), join('ada', 9)]);

        expect(result.current.readCountOf(9, 'bob')).toEqual({ readIds: ['me', 'ada'], unreadIds: [] });
    });

    it('leaves a member who has left out of both lists', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 5), join('ada', 5), join('bob', 0, { joined: 0 })]);

        expect(result.current.readCountOf(5, 'cy')).toEqual({ readIds: ['me', 'ada'], unreadIds: [] });
    });

    it('puts a member on neither side until their join row arrives', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 5), join('ada', 5)]);

        expect(result.current.readCountOf(5, 'cy')).toEqual({ readIds: ['me', 'ada'], unreadIds: [] });
    });

    it('does not count the last room’s rows against the room switched to', () => {
        const { result, rerender } = renderHook(({ channel }) => useChannelReadCounts(channel), {
            initialProps: { channel: GROUP },
        });
        emitJoins([join('me', 9), join('ada', 9)]);
        rerender({ channel: { ...GROUP, id: 'C2' } as DomainChannel });

        expect(result.current.readCountOf(9, 'me')).toBeNull();
    });

    it('has no count before any join row has arrived', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));

        expect(result.current.readCountOf(1, 'me')).toBeNull();
    });

    it('has no count in a room with fewer than two members', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 5)]);

        expect(result.current.readCountOf(5, 'me')).toBeNull();
    });

    it('has no count for a message every other member joined after', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 9), join('ada', 9, { joinedNo: 5 }), join('bob', 9, { joinedNo: 5 })]);

        expect(result.current.readCountOf(3, 'me')).toBeNull();
    });

    it('has no count in my notes-to-self channel', () => {
        const self = { ...GROUP, stereo: 'self' } as DomainChannel;
        const { result } = renderHook(() => useChannelReadCounts(self));
        emitJoins([join('me', 5), join('ada', 5)]);

        expect(result.current.readCountOf(5, 'me')).toBeNull();
    });

    it('lists the cursors of the active members other than me, in roster order', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 10), join('ada', 7), join('bob', 0, { joined: 0 }), join('cy', 3)]);

        expect(result.current.cursors).toEqual([
            { userId: 'ada', cursor: 7 },
            { userId: 'cy', cursor: 3 },
        ]);
    });

    it('carries each member’s joinedNo in cursors, so a marker is not put before they arrived', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 9), join('ada', 9, { joinedNo: 6 })]);

        expect(result.current.cursors).toEqual([{ userId: 'ada', cursor: 9, joinedNo: 6 }]);
    });

    it('takes the further of readNo and chatNo as the cursors entry', () => {
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 2), join('ada', 4, { readNo: 9 })]);

        expect(result.current.cursors).toEqual([{ userId: 'ada', cursor: 9 }]);
    });

    it('has no cursors before any join row has arrived, in a room of one, or in my notes-to-self channel', () => {
        const { result, rerender } = renderHook(({ channel }) => useChannelReadCounts(channel), {
            initialProps: { channel: GROUP },
        });
        expect(result.current.cursors).toEqual([]);

        emitJoins([join('me', 5)]);
        expect(result.current.cursors).toEqual([]);

        emitJoins([join('me', 5), join('ada', 5)]);
        expect(result.current.cursors).toHaveLength(1);
        rerender({ channel: { ...GROUP, stereo: 'self' } as DomainChannel });
        expect(result.current.cursors).toEqual([]);
    });

    it('has no cursors until my own user id is known, so I never show up as someone else', () => {
        session.uids = {};
        const { result } = renderHook(() => useChannelReadCounts(GROUP));
        emitJoins([join('me', 5), join('ada', 5)]);

        expect(result.current.cursors).toEqual([]);
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
