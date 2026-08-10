import { beforeEach, describe, expect, it } from 'vitest';

import { usePendingOpenStore } from './usePendingOpenStore';

describe('usePendingOpenStore', () => {
    beforeEach(() => usePendingOpenStore.getState().clear());

    // A notification click on a thread reply has to reach HomePage's pendingThreadRef; the
    // target is the only thing that crosses from the listener to the page, so it must carry
    // the root. Without it the click can only select the channel, where the reply is hidden.
    it('carries the thread root of the notification target', () => {
        usePendingOpenStore.getState().request('site1', 'c1', undefined, '1234');
        expect(usePendingOpenStore.getState().target).toMatchObject({
            placeId: 'site1',
            channelId: 'c1',
            rootId: '1234',
        });
    });

    it('leaves the root unset for a top-level message', () => {
        usePendingOpenStore.getState().request('site1', 'c1');
        expect(usePendingOpenStore.getState().target?.rootId).toBeUndefined();
    });

    it('bumps the nonce so a repeat of the same target still fires', () => {
        usePendingOpenStore.getState().request('site1', 'c1', undefined, '1234');
        const first = usePendingOpenStore.getState().target?.nonce;
        usePendingOpenStore.getState().request('site1', 'c1', undefined, '1234');
        expect(usePendingOpenStore.getState().target?.nonce).toBeGreaterThan(first ?? 0);
    });
});
