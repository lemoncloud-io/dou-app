import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SharedModule from '../../../shared';

const mutations = vi.hoisted(() => ({
    deleteChannel: vi.fn(),
    leaveChannel: vi.fn(),
    inviteChannel: vi.fn(),
}));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useDesktopChannelMutations: () => ({ ...mutations, isMutating: false }),
}));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: vi.fn() }));

import '../../../../i18n';
import { useComposerFocusStore } from '../../../shared';
import { useChannelActions } from './useChannelActions';

// The confirm closes before the removal resolves and the room it came from goes away, so the
// next room has to be told to take focus.
describe('useChannelActions focus request after removing a channel', () => {
    beforeEach(() => {
        mutations.deleteChannel.mockResolvedValue(undefined);
        mutations.leaveChannel.mockResolvedValue(undefined);
    });
    afterEach(() => {
        useComposerFocusStore.setState({ removedId: null });
        vi.clearAllMocks();
    });

    it('asks the next room for focus once a delete succeeds, before the removal callback', async () => {
        let removedIdAtCallback: string | null = null;
        const { result } = renderHook(() =>
            useChannelActions('C1', {
                onRemoved: () => {
                    removedIdAtCallback = useComposerFocusStore.getState().removedId;
                },
            })
        );

        await act(() => result.current.onDelete());

        expect(useComposerFocusStore.getState().removedId).toBe('C1');
        expect(removedIdAtCallback).toBe('C1');
    });

    it('asks the next room for focus once a leave succeeds', async () => {
        const { result } = renderHook(() => useChannelActions('C1'));

        await act(() => result.current.onLeave());

        expect(useComposerFocusStore.getState().removedId).toBe('C1');
    });

    it('asks for nothing when the delete fails — the room is still there', async () => {
        mutations.deleteChannel.mockRejectedValue(new Error('forbidden'));
        const { result } = renderHook(() => useChannelActions('C1'));

        await act(() => result.current.onDelete());

        expect(useComposerFocusStore.getState().removedId).toBeNull();
    });

    it('asks for nothing when the leave fails', async () => {
        mutations.leaveChannel.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useChannelActions('C1'));

        await act(() => result.current.onLeave());

        expect(useComposerFocusStore.getState().removedId).toBeNull();
    });
});
