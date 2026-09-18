import { renderHook } from '@testing-library/react';

import { useChannelSyncMarkStore, useHasChannelSync } from './useChannelSyncMarkStore';

beforeEach(() => {
    useChannelSyncMarkStore.setState({ synced: {} });
});

describe('useChannelSyncMarkStore — first channel delta per cloud', () => {
    it('reads as not answered before any delta landed', () => {
        const { result } = renderHook(() => useHasChannelSync('cloud-A', 'u1'));

        expect(result.current).toBe(false);
    });

    it('marks the {cid, uid} scope that was answered', () => {
        useChannelSyncMarkStore.getState().markSynced('cloud-A', 'u1');

        const { result } = renderHook(() => useHasChannelSync('cloud-A', 'u1'));

        expect(result.current).toBe(true);
    });

    it('keeps the clouds apart — one cloud answering does not open another cloud gate', () => {
        useChannelSyncMarkStore.getState().markSynced('cloud-A', 'u1');

        const { result } = renderHook(() => useHasChannelSync('cloud-B', 'u1'));

        expect(result.current).toBe(false);
    });

    it('keeps the accounts apart — a second account waits for its own answer', () => {
        // Both accounts read a different local cache, so inheriting the mark would show the new one
        // an empty chat section for a cloud whose rooms it has never fetched.
        useChannelSyncMarkStore.getState().markSynced('cloud-A', 'u1');

        const { result } = renderHook(() => useHasChannelSync('cloud-A', 'u2'));

        expect(result.current).toBe(false);
    });

    it('treats a missing uid as its own scope rather than throwing', () => {
        useChannelSyncMarkStore.getState().markSynced('default', undefined);

        const { result } = renderHook(() => useHasChannelSync('default', undefined));

        expect(result.current).toBe(true);
    });

    it('returns the same state reference when a scope is marked twice (no wasted re-render)', () => {
        useChannelSyncMarkStore.getState().markSynced('cloud-A', 'u1');
        const before = useChannelSyncMarkStore.getState();

        // Every poll tick and foreground return re-marks the active scope.
        useChannelSyncMarkStore.getState().markSynced('cloud-A', 'u1');

        expect(useChannelSyncMarkStore.getState()).toBe(before);
    });
});
