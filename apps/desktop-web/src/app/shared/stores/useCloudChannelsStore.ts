import { create } from 'zustand';

import type { DomainChannel } from '@chatic/data';

interface CloudChannelsState {
    /** Last known-good channel list per cloud id, kept for instant restore on switch. */
    byCloud: Record<string, DomainChannel[]>;
    remember: (cloudId: string, channels: DomainChannel[]) => void;
}

/**
 * Per-cloud snapshot of the last verified channel list. Switching between clouds should show
 * each cloud's own list instantly — no skeleton, no flash of the other cloud's channels — so
 * useChannels renders this snapshot while the live cache re-verifies for the target cloud, then
 * replaces it with the fresh list and updates the snapshot. In-memory (per session): a reload
 * re-derives each cloud's list from its own verified sync.
 */
export const useCloudChannelsStore = create<CloudChannelsState>(set => ({
    byCloud: {},
    remember: (cloudId, channels) => set(state => ({ byCloud: { ...state.byCloud, [cloudId]: channels } })),
}));
