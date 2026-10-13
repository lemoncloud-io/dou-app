import { beforeEach, describe, expect, it } from 'vitest';

import { hasUnreadThread, useMyThreadsStore } from './useMyThreadsStore';
import type { ThreadReply } from '../utils/myThreads';

const reply = (over: Partial<ThreadReply> = {}): ThreadReply => ({
    cid: 'cloud-a',
    channelId: 'C1',
    rootNo: '1',
    replyNo: 2,
    preview: 'reply',
    ownerName: 'Bob',
    at: 1,
    mine: false,
    ...over,
});
const root = { preview: 'root', ownerName: 'Ada' };

describe('useMyThreadsStore', () => {
    beforeEach(() => useMyThreadsStore.setState({ threads: {}, backfilled: {} }));

    it("lights the dot only for the cloud whose thread has a new reply — another cloud's stays out", () => {
        useMyThreadsStore.getState().record(reply({ cid: 'cloud-b' }), { root });
        const { threads } = useMyThreadsStore.getState();

        expect(hasUnreadThread(threads, 'cloud-b')).toBe(true);
        expect(hasUnreadThread(threads, 'cloud-a')).toBe(false);
    });

    it("lights the dot for the place whose thread has a new reply, and for a 1:1's — not for another place's", () => {
        useMyThreadsStore.getState().record(reply({ placeId: 'P2' }), { root });
        expect(hasUnreadThread(useMyThreadsStore.getState().threads, 'cloud-a', 'P2')).toBe(true);
        expect(hasUnreadThread(useMyThreadsStore.getState().threads, 'cloud-a', 'P1')).toBe(false);

        useMyThreadsStore.getState().record(reply({ channelId: 'D1', placeId: 'P2', channelKind: 'dm' }), { root });
        expect(hasUnreadThread(useMyThreadsStore.getState().threads, 'cloud-a', 'P1')).toBe(true);
    });

    it("marks one place's threads seen and leaves another place's unread", () => {
        useMyThreadsStore.getState().record(reply({ placeId: 'P1' }), { root });
        useMyThreadsStore.getState().record(reply({ channelId: 'C9', placeId: 'P2' }), { root });

        useMyThreadsStore.getState().markAllSeen('cloud-a', 'P1');

        const { threads } = useMyThreadsStore.getState();
        expect(hasUnreadThread(threads, 'cloud-a', 'P1')).toBe(false);
        expect(hasUnreadThread(threads, 'cloud-a', 'P2')).toBe(true);
    });

    it('keeps the same state for a reply already recorded and for a thread with nothing to mark', () => {
        useMyThreadsStore.getState().record(reply({ mine: true }), { root });
        const before = useMyThreadsStore.getState();

        before.record(reply({ mine: true }));
        before.markSeen('cloud-a', 'C1', '1');

        expect(useMyThreadsStore.getState().threads).toBe(before.threads);
    });

    it('removes a thread, and leaves the state as it is for one it does not hold', () => {
        useMyThreadsStore.getState().record(reply(), { root });

        useMyThreadsStore.getState().remove('cloud-a', 'C1', '1');
        const after = useMyThreadsStore.getState().threads;
        useMyThreadsStore.getState().remove('cloud-a', 'C1', '1');

        expect(after).toEqual({});
        expect(useMyThreadsStore.getState().threads).toBe(after);
    });

    it('clears the dot once the thread is seen', () => {
        useMyThreadsStore.getState().record(reply(), { root });
        useMyThreadsStore.getState().markSeen('cloud-a', 'C1', '1');

        expect(hasUnreadThread(useMyThreadsStore.getState().threads, 'cloud-a')).toBe(false);
    });

    it("records a cloud's cached threads as read and remembers the cloud as done", () => {
        useMyThreadsStore.getState().backfill('cloud-a', [{ reply: reply(), root }]);
        const state = useMyThreadsStore.getState();

        expect(hasUnreadThread(state.threads, 'cloud-a')).toBe(false);
        expect(Object.keys(state.threads)).toEqual(['cloud-a:C1:1']);
        expect(state.backfilled).toEqual({ 'cloud-a': true });
    });

    it('leaves a thread that is already listed, unread, as it is', () => {
        useMyThreadsStore.getState().record(reply({ replyNo: 3 }), { root });
        useMyThreadsStore.getState().backfill('cloud-a', [{ reply: reply({ replyNo: 3 }), root }]);

        expect(hasUnreadThread(useMyThreadsStore.getState().threads, 'cloud-a')).toBe(true);
    });
});
