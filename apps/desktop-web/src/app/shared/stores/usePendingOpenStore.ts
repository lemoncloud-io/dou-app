import { create } from 'zustand';

export interface PendingOpenTarget {
    placeId: string;
    channelId: string;
    /** Bumped on each request so a repeated target to the same channel still fires. */
    nonce: number;
}

interface PendingOpenState {
    target: PendingOpenTarget | null;
    /** Request opening a place+channel (from an OS notification click, any route). */
    request: (placeId: string, channelId: string) => void;
    /** Clear after HomePage has applied the target. */
    clear: () => void;
}

let seq = 0;

/**
 * A pending "open this place + channel" target. The always-mounted notification
 * listener writes it (and routes to '/'); HomePage consumes it once its channels
 * load. Decouples notification handling from the home route being mounted.
 */
export const usePendingOpenStore = create<PendingOpenState>(set => ({
    target: null,
    request: (placeId, channelId) => set({ target: { placeId, channelId, nonce: ++seq } }),
    clear: () => set({ target: null }),
}));
