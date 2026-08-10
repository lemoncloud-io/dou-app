import { create } from 'zustand';

// Direct file import, not the `../utils` barrel: that barrel reaches back into this stores
// barrel (myNames), so a value import would close a cycle. `import type` is erased, so this
// one costs nothing at runtime.
import type { PushDeeplinkTarget } from '../utils/parsePushDeeplink';

/**
 * A notification's open target — the same address the deeplink parser produces (cloud → place
 * → channel → thread root), plus a nonce so a repeat of the identical target still fires.
 */
export type PendingOpenTarget = PushDeeplinkTarget & {
    nonce: number;
};

interface PendingOpenState {
    target: PendingOpenTarget | null;
    /** Request opening a (cloud →) place → channel (→ thread) from a notification click, any route. */
    request: (target: PushDeeplinkTarget) => void;
    /** Clear after HomePage has applied the target. */
    clear: () => void;
}

let seq = 0;

/**
 * A pending "open this cloud + place + channel (+ thread)" target. The always-mounted
 * notification listener writes it (and routes to '/'); HomePage consumes it once
 * the target's channels load, switching cloud/place first when needed. Decouples
 * notification handling from the home route being mounted.
 */
export const usePendingOpenStore = create<PendingOpenState>(set => ({
    target: null,
    request: target => set({ target: { ...target, nonce: ++seq } }),
    clear: () => set({ target: null }),
}));
