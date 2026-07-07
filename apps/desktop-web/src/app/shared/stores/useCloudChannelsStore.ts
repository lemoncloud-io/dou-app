import { create } from 'zustand';

import type { DomainChannel } from '@chatic/data';

interface CloudChannelsState {
    /** Last known-good (non-empty) channel list per cloud id, kept for instant restore on switch. */
    byCloud: Record<string, DomainChannel[]>;
    remember: (cloudId: string, channels: DomainChannel[]) => void;
}

/**
 * Per-cloud snapshot of the last non-empty channel list. The cross-cloud cache poisoning is
 * fixed at the engine (socket-scoped writes), so the live list is now correct — but a switch
 * still passes through brief empty/relay frames before the target cloud settles. useChannels
 * renders this snapshot during those blips so each cloud's list shows instantly and stays put,
 * then the live list takes over. In-memory (per session).
 */
export const useCloudChannelsStore = create<CloudChannelsState>(set => ({
    byCloud: {},
    remember: (cloudId, channels) => set(state => ({ byCloud: { ...state.byCloud, [cloudId]: channels } })),
}));
