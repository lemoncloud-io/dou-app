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
        const { result } = renderHook(() => useTrailingPanelOwners());
        act(() => useThreadStore.getState().open('root-1'));
        act(() => useProfilePanelStore.getState().open(person));

        expect(result.current.profileTarget).toEqual(person);
        expect(result.current.threadRootId).toBe('root-1');

        act(() => useProfilePanelStore.getState().close());

        expect(result.current.profileTarget).toBeNull();
        expect(result.current.threadRootId).toBe('root-1');
    });

    it('keeps the settings panel under a profile opened from its member list', () => {
        const { result } = renderHook(() => useTrailingPanelOwners());
        act(() => useChannelSettingsStore.getState().open('ch-1'));
        act(() => useProfilePanelStore.getState().open(person));
        act(() => useProfilePanelStore.getState().close());

        expect(result.current.settingsChannelId).toBe('ch-1');
    });

    it('closes an open profile when another thread opens', () => {
        const { result } = renderHook(() => useTrailingPanelOwners());
        act(() => useThreadStore.getState().open('root-1'));
        act(() => useProfilePanelStore.getState().open(person));
        act(() => useThreadStore.getState().open('root-2'));

        expect(result.current.profileTarget).toBeNull();
        expect(result.current.threadRootId).toBe('root-2');
    });

    it('lets the last exclusive panel opened win', () => {
        const { result } = renderHook(() => useTrailingPanelOwners());
        act(() => useThreadStore.getState().open('root-1'));
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
});
