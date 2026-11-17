import { host } from '@chatic/host';

import { appBridge } from '../../bridge/appBridge';

/**
 * What the device is really showing on its app icon, or `null` when that cannot be known.
 *
 * **`null` is a distinct answer from 0.** Zero is a valid badge, so a reader that returns 0 for
 * "unknown" makes every consumer compare against a value that means nothing — which on Android
 * would mark every device as diverged forever (ADR-0099).
 *
 * Two platforms, two sources, and the split is not a style choice:
 * - **iOS** answers the live icon badge, which the app process can read directly.
 * - **Android** has no readable icon badge at all. notifee's badge API is a no-op off iOS and
 *   resolves a constant 0, and the launcher number is driven by the posted notification rather than
 *   by anything queryable. The real count lives in a native shared counter, reached by a separate
 *   bridge message.
 *
 * Which source applies is the host's `appShell` port: none unless the app runs the frame, the icon
 * badge where its `os` is iOS, and the shared counter for any other app.
 *
 * A failed round trip is `null` for that read only; the next read asks again.
 */
export interface INativeBadgeReader {
    /** The device's badge value, or `null` when this platform cannot answer. */
    read(): Promise<number | null>;
}

class NativeBadgeReader implements INativeBadgeReader {
    async read(): Promise<number | null> {
        const appShell = host.ports.appShell;
        if (appShell.kind !== 'app') return null;

        if (appShell.os === 'ios') {
            try {
                const response = await appBridge.fetchBadgeCount();
                // The bridge facade answers the raw response, so a refused round trip can arrive as
                // `success: false` rather than a rejection. Either way the value is unknown.
                if (!response?.success) return null;
                return response.data?.count ?? null;
            } catch {
                return null;
            }
        }

        try {
            const response = await appBridge.fetchBadgeBase();
            if (!response?.success) return null;
            // `base: null` means "this platform cannot answer".
            return response.data?.base ?? null;
        } catch {
            return null;
        }
    }
}

export const nativeBadgeReader: INativeBadgeReader = new NativeBadgeReader();
