import { beforeEach, describe, expect, it } from 'vitest';

import { useMyThreadsStore } from './useMyThreadsStore';
import { isThreadUnread, type ThreadReply } from '../utils/myThreads';

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

    it('keeps the same state for a reply already recorded and for a thread with nothing to mark', () => {
        useMyThreadsStore.getState().record(reply({ mine: true }), { root });
        const before = useMyThreadsStore.getState();

        before.record(reply({ mine: true }));
        before.markSeen('cloud-a', 'C1', '1');

        expect(useMyThreadsStore.getState().threads).toBe(before.threads);
    });

    it('marks the thread read once it is seen', () => {
        useMyThreadsStore.getState().record(reply(), { root });
        useMyThreadsStore.getState().markSeen('cloud-a', 'C1', '1');

        expect(isThreadUnread(useMyThreadsStore.getState().threads['cloud-a:C1:1'])).toBe(false);
    });

    it("records a cloud's cached threads as read and remembers the cloud as done", () => {
        useMyThreadsStore.getState().backfill('cloud-a', [{ reply: reply(), root }]);
        const state = useMyThreadsStore.getState();

        expect(isThreadUnread(state.threads['cloud-a:C1:1'])).toBe(false);
        expect(Object.keys(state.threads)).toEqual(['cloud-a:C1:1']);
        expect(state.backfilled).toEqual({ 'cloud-a': true });
    });

    it('leaves a thread that is already listed, unread, as it is', () => {
        useMyThreadsStore.getState().record(reply({ replyNo: 3 }), { root });
        useMyThreadsStore.getState().backfill('cloud-a', [{ reply: reply({ replyNo: 3 }), root }]);

        expect(isThreadUnread(useMyThreadsStore.getState().threads['cloud-a:C1:1'])).toBe(true);
    });
});
