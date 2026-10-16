import { renderHook } from '@testing-library/react';

import { useReclaimOwnedClouds } from './useReclaimOwnedClouds';

const mockReclaimOwnedClouds = jest.fn();
let mockCommitListeners: Array<{ kinds: readonly string[]; listener: () => void }> = [];

jest.mock('../../socket/auth/reclaimOwnedClouds', () => ({
    reclaimOwnedClouds: (...args: unknown[]) => mockReclaimOwnedClouds(...args),
}));
jest.mock('../../session/store', () => ({
    sessionSignal: {
        subscribe: (kinds: readonly string[], listener: () => void) => {
            const entry = { kinds, listener };
            mockCommitListeners.push(entry);
            return () => {
                mockCommitListeners = mockCommitListeners.filter(e => e !== entry);
            };
        },
    },
}));

/** Fires every listener subscribed to `kind`, the way the session signal flushes one. */
const emit = (kind: string) => mockCommitListeners.filter(e => e.kinds.includes(kind)).forEach(e => e.listener());

describe('useReclaimOwnedClouds', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockCommitListeners = [];
        mockReclaimOwnedClouds.mockResolvedValue([]);
    });

    it('hands the owned list to the reclaim', () => {
        renderHook(() => useReclaimOwnedClouds(['a', 'b']));

        expect(mockReclaimOwnedClouds).toHaveBeenCalledWith(['a', 'b']);
    });

    it('runs again when the list changes, and not for a fresh array with the same content', () => {
        const { rerender } = renderHook(({ cids }) => useReclaimOwnedClouds(cids), {
            initialProps: { cids: ['a'] as readonly string[] },
        });

        rerender({ cids: ['a'] });
        rerender({ cids: ['a', 'b'] });

        expect(mockReclaimOwnedClouds.mock.calls).toEqual([[['a']], [['a', 'b']]]);
    });

    it('runs again on a cloud token commit, with the latest list', () => {
        // An invite entry committed after the catalog resolved: no list change follows it.
        const { rerender } = renderHook(({ cids }) => useReclaimOwnedClouds(cids), {
            initialProps: { cids: ['a'] as readonly string[] },
        });
        rerender({ cids: ['a', 'b'] });
        mockReclaimOwnedClouds.mockClear();

        emit('cloud:token');

        expect(mockReclaimOwnedClouds).toHaveBeenCalledWith(['a', 'b']);
    });

    it('ignores other session signals, and stops listening on unmount', () => {
        const { unmount } = renderHook(() => useReclaimOwnedClouds(['a']));
        mockReclaimOwnedClouds.mockClear();

        emit('selection');
        unmount();
        emit('cloud:token');

        expect(mockReclaimOwnedClouds).not.toHaveBeenCalled();
    });

    it('does nothing while the account owns no cloud, a commit included', () => {
        renderHook(() => useReclaimOwnedClouds([]));

        emit('cloud:token');

        expect(mockReclaimOwnedClouds).not.toHaveBeenCalled();
    });
});
