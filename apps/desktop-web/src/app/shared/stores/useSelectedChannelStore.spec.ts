import { beforeEach, describe, expect, it } from 'vitest';

import { useSelectedChannelStore } from './useSelectedChannelStore';

beforeEach(() => {
    useSelectedChannelStore.setState({ selectedChannelId: null });
});

describe('useSelectedChannelStore', () => {
    it('clears the open channel', () => {
        useSelectedChannelStore.getState().selectChannel('a');
        useSelectedChannelStore.getState().clearChannel();
        expect(useSelectedChannelStore.getState().selectedChannelId).toBeNull();
    });

    // A delete answers about a second after its confirm, and the reader may have opened another
    // room by then; clearing that one took it away from under them.
    it('clears a channel named for it only while that channel is still the open one', () => {
        useSelectedChannelStore.getState().selectChannel('b');
        useSelectedChannelStore.getState().clearIfOpen('a');
        expect(useSelectedChannelStore.getState().selectedChannelId).toBe('b');

        useSelectedChannelStore.getState().clearIfOpen('b');
        expect(useSelectedChannelStore.getState().selectedChannelId).toBeNull();
    });

    it('changes nothing when given no channel', () => {
        useSelectedChannelStore.getState().selectChannel('a');
        useSelectedChannelStore.getState().clearIfOpen(null);
        expect(useSelectedChannelStore.getState().selectedChannelId).toBe('a');
    });
});
