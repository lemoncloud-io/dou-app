import { create } from 'zustand';

export interface PendingOpenTarget {
    /** Source cloud (relay cloudId) for a cross-cloud target; absent → active cloud. */
    cloudId?: string;
    placeId: string;
    channelId: string;
    /**
     * Thread root when the notification was for a reply — the channel alone is not enough,
     * because a reply lives in the thread panel and is hidden from the main feed.
     */
    rootId?: string;
    /** Bumped on each request so a repeated target to the same channel still fires. */
    nonce: number;
}

interface PendingOpenState {
    target: PendingOpenTarget | null;
    /** Request opening a (cloud →) place → channel (→ thread) from a notification click, any route. */
    request: (placeId: string, channelId: string, cloudId?: string, rootId?: string) => void;
    /** Clear after HomePage has applied the target. */
    clear: () => void;
}

let seq = 0;

/**
 * A pending "open this cloud + place + channel" target. The always-mounted
 * notification listener writes it (and routes to '/'); HomePage consumes it once
 * the target's channels load, switching cloud/place first when needed. Decouples
 * notification handling from the home route being mounted.
 */
export const usePendingOpenStore = create<PendingOpenState>(set => ({
    target: null,
    request: (placeId, channelId, cloudId, rootId) =>
        set({ target: { cloudId, placeId, channelId, rootId, nonce: ++seq } }),
    clear: () => set({ target: null }),
}));
