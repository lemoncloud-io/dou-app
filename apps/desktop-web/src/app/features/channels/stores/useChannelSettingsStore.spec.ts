import { beforeEach, describe, expect, it } from 'vitest';

import { useChannelSettingsStore } from './useChannelSettingsStore';

beforeEach(() => {
    useChannelSettingsStore.setState({ openChannelId: null, focus: null });
});

describe('useChannelSettingsStore', () => {
    it('closes the open panel', () => {
        useChannelSettingsStore.getState().open('a', 'members');
        useChannelSettingsStore.getState().close();
        expect(useChannelSettingsStore.getState()).toMatchObject({ openChannelId: null, focus: null });
    });

    // A delete from the panel answers after the reader may have opened another channel's settings.
    it("closes a channel's panel only while it is that channel's panel that is open", () => {
        useChannelSettingsStore.getState().open('b');
        useChannelSettingsStore.getState().closeIfOpenFor('a');
        expect(useChannelSettingsStore.getState().openChannelId).toBe('b');

        useChannelSettingsStore.getState().closeIfOpenFor('b');
        expect(useChannelSettingsStore.getState().openChannelId).toBeNull();
    });

    it('changes nothing when given no channel', () => {
        useChannelSettingsStore.getState().open('a');
        useChannelSettingsStore.getState().closeIfOpenFor(null);
        expect(useChannelSettingsStore.getState().openChannelId).toBe('a');
    });
});
