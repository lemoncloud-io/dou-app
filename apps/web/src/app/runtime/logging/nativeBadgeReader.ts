import { isNative } from '@chatic/bridges';

import { appBridge } from '../../bridge/appBridge';

/**
 * What the device is really showing on its app icon, or `null` when that cannot be known.
 *
 * **`null` is a distinct answer from 0.** Zero is a valid badge, so a reader that returns 0 for
 * "unknown" makes every consumer compare against a value that means nothing — which on Android
 * would mark every device as diverged forever (ADR-0075).
 *
 * Two platforms, two sources, and the split is not a style choice:
 * - **iOS** answers the live icon badge, which the app process can read directly.
 * - **Android** has no readable icon badge at all. notifee's badge API is a no-op off iOS and
 *   resolves a constant 0, and the launcher number is driven by the posted notification rather than
 *   by anything queryable. The real count lives in a native shared counter, reached by a separate
 *   bridge message.
 *
 * That second message is newer than this code's audience: the web ships ahead of the app, so a
 * shell without the handler answers `NOT_FOUND`. One such answer settles the question for the rest
 * of the session — there is one installed app, so there is one answer. Only `NOT_FOUND` is learned
 * from; a timeout or transport error is transient, and treating one as a permanent verdict would
 * silence the check for a whole session over a single slow round trip. (Same reasoning, and the same
 * shape, as `nativeUploadSource`.)
 */
export interface INativeBadgeReader {
    /** The device's badge value, or `null` when this platform/build cannot answer. */
    read(): Promise<number | null>;
    /** Test seam — clears the learned capability verdict. */
    reset(): void;
}

class NativeBadgeReader implements INativeBadgeReader {
    private baseUnsupported = false;

    async read(): Promise<number | null> {
        if (!isNative()) return null;

        const platform = typeof window !== 'undefined' ? window.CHATIC_APP_PLATFORM?.toLowerCase() : undefined;

        if (platform === 'ios') {
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

        if (this.baseUnsupported) return null;
        try {
            const response = await appBridge.fetchBadgeBase();
            if (!response?.success) return null;
            // `base: null` from a shell that HAS the message means "this platform cannot answer" —
            // distinct from the shell not knowing the message at all, which rejects below.
            return response.data?.base ?? null;
        } catch (error) {
            if ((error as { code?: string })?.code === 'NOT_FOUND') this.baseUnsupported = true;
            return null;
        }
    }

    reset(): void {
        this.baseUnsupported = false;
    }
}

export const nativeBadgeReader: INativeBadgeReader = new NativeBadgeReader();
