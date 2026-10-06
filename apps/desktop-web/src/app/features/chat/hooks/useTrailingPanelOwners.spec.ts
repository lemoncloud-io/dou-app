import { beforeEach, describe, expect, it } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { useChannelSettingsStore } from '../../channels';
import { useMentionsPanelStore, useProfilePanelStore, useSavedPanelStore } from '../../../shared';
import { useThreadStore } from '../stores';
import { useTrailingPanelOwners } from './useTrailingPanelOwners';

const person = { userId: 'u-1', fallbackName: 'Aiden' };

describe('useTrailingPanelOwners', () => {
    beforeEach(() => {
        act(() => {
            useThreadStore.getState().close();
            useChannelSettingsStore.getState().close();
            useProfilePanelStore.getState().close();
            useSavedPanelStore.getState().close();
            useMentionsPanelStore.getState().close();
        });
    });

    it('keeps the thread under a profile opened from it, and shows it again once the profile closes', () => {
        const { result } = renderHook(() => useTrailingPanelOwners('ch-1', false));
        act(() => useThreadStore.getState().open('root-1', 'ch-1'));
        act(() => useProfilePanelStore.getState().open(person));

        expect(result.current.profileTarget).toEqual(person);
        expect(result.current.threadRootId).toBe('root-1');

        act(() => useProfilePanelStore.getState().close());

        expect(result.current.profileTarget).toBeNull();
        expect(result.current.threadRootId).toBe('root-1');
    });

    it('keeps the settings panel under a profile opened from its member list', () => {
        const { result } = renderHook(() => useTrailingPanelOwners('ch-1', false));
        act(() => useChannelSettingsStore.getState().open('ch-1'));
        act(() => useProfilePanelStore.getState().open(person));
        act(() => useProfilePanelStore.getState().close());

        expect(result.current.settingsChannelId).toBe('ch-1');
    });

    it('closes an open profile when another thread opens', () => {
        const { result } = renderHook(() => useTrailingPanelOwners('ch-1', false));
        act(() => useThreadStore.getState().open('root-1', 'ch-1'));
        act(() => useProfilePanelStore.getState().open(person));
        act(() => useThreadStore.getState().open('root-2', 'ch-1'));

        expect(result.current.profileTarget).toBeNull();
        expect(result.current.threadRootId).toBe('root-2');
    });

    it('lets the last exclusive panel opened win', () => {
        const { result } = renderHook(() => useTrailingPanelOwners('ch-1', false));
        act(() => useThreadStore.getState().open('root-1', 'ch-1'));
        act(() => useProfilePanelStore.getState().open(person));
        act(() => useSavedPanelStore.getState().open());

        expect(result.current).toMatchObject({
            savedOpen: true,
            threadRootId: null,
            profileTarget: null,
            settingsChannelId: null,
            activityOpen: false,
        });
    });
    describe('a thread belongs to the channel it was opened in', () => {
        const renderOwners = (initialProps: { channelId: string | undefined; loading: boolean }) =>
            renderHook(({ channelId, loading }) => useTrailingPanelOwners(channelId, loading), { initialProps });

        it('never hands the panel a thread opened in another channel, and closes it', () => {
            const seen: Array<string | null> = [];
            const { rerender } = renderHook(
                ({ channelId }) => {
                    const owners = useTrailingPanelOwners(channelId, false);
                    seen.push(owners.threadRootId);
                    return owners;
                },
                { initialProps: { channelId: 'ch-1' as string | undefined } }
            );
            act(() => useThreadStore.getState().open('9', 'ch-1'));
            seen.length = 0;

            rerender({ channelId: 'ch-2' });

            // The render that sees the new channel must already be without the old thread — the close
            // effect only runs after it commits, and a panel drawn in between asks for the wrong room.
            expect(seen.every(rootId => rootId === null)).toBe(true);
            expect(useThreadStore.getState().openRootId).toBeNull();
        });

        it('closes a thread whose channel is gone once the list has loaded without it', () => {
            const { result, rerender } = renderOwners({ channelId: 'ch-1', loading: false });
            act(() => useThreadStore.getState().open('9', 'ch-1'));

            rerender({ channelId: undefined, loading: false });

            expect(result.current.threadRootId).toBeNull();
            expect(useThreadStore.getState().openRootId).toBeNull();
        });

        it('holds a thread opened while the list loads, and shows it when the list has the channel', () => {
            const { result, rerender } = renderOwners({ channelId: undefined, loading: true });
            act(() => useThreadStore.getState().open('9', 'ch-1'));

            // Not known yet: nothing is drawn, but nothing is closed either.
            expect(result.current.threadRootId).toBeNull();
            expect(useThreadStore.getState().openRootId).toBe('9');

            rerender({ channelId: 'ch-1', loading: false });

            expect(result.current.threadRootId).toBe('9');
        });

        it('closes a held thread when the list has loaded without its channel', () => {
            const { result, rerender } = renderOwners({ channelId: undefined, loading: true });
            act(() => useThreadStore.getState().open('9', 'ch-1'));

            rerender({ channelId: undefined, loading: false });

            expect(result.current.threadRootId).toBeNull();
            expect(useThreadStore.getState().openRootId).toBeNull();
        });

        it('closes a held thread when the list arrives with only other channels', () => {
            const { result, rerender } = renderOwners({ channelId: undefined, loading: true });
            act(() => useThreadStore.getState().open('9', 'ch-1'));

            rerender({ channelId: 'ch-2', loading: false });

            expect(result.current.threadRootId).toBeNull();
            expect(useThreadStore.getState().openRootId).toBeNull();
        });

        it('keeps a thread opened in the channel that is showing', () => {
            const { result } = renderHook(() => useTrailingPanelOwners('ch-1', false));
            act(() => useThreadStore.getState().open('9', 'ch-1'));

            expect(result.current.threadRootId).toBe('9');
        });
    });
});
