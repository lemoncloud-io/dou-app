import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMessageJumpStore } from './useMessageJumpStore';

describe('useMessageJumpStore', () => {
    beforeEach(() => useMessageJumpStore.setState({ target: null, origin: null, position: null }));

    it('flashes a jump unless it is asked to restore', () => {
        const { request } = useMessageJumpStore.getState();
        request('C1', 5);
        expect(useMessageJumpStore.getState().target).toMatchObject({ chatNo: 5, restore: false });
        request('C1', 5, { restore: true });
        expect(useMessageJumpStore.getState().target).toMatchObject({ chatNo: 5, restore: true });
    });

    // The feed ignores a nonce it has already handled. Counting from the current target
    // restarted at 1 after every landing, so the second jump in an open channel did nothing.
    it('gives a jump after a landed one a fresh nonce', () => {
        const { request, clear } = useMessageJumpStore.getState();
        request('C1', 5);
        const first = useMessageJumpStore.getState().target?.nonce;
        clear();
        request('C1', 9);
        expect(useMessageJumpStore.getState().target?.nonce).not.toBe(first);
    });

    // The feed reports on every scroll frame; subscribers must hear only real moves.
    it('notifies only when the reading position changes', () => {
        const listener = vi.fn();
        const unsubscribe = useMessageJumpStore.subscribe(listener);
        const { setPosition } = useMessageJumpStore.getState();
        setPosition({ channelId: 'C1', chatNo: 7 });
        setPosition({ channelId: 'C1', chatNo: 7 });
        setPosition({ channelId: 'C1', chatNo: null });
        unsubscribe();
        expect(listener).toHaveBeenCalledTimes(2);
        expect(useMessageJumpStore.getState().position).toEqual({ channelId: 'C1', chatNo: null });
    });
});
