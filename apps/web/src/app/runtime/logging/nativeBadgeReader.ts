import { runtime } from '@chatic/runtime';

/**
 * What the device is really showing on its app icon, or `null` when that cannot be known.
 *
 * **`null` is a distinct answer from 0.** Zero is a valid badge, so a reader that returns 0 for
 * "unknown" makes every consumer compare against a value that means nothing — which on Android
 * would mark every device as diverged forever (ADR-0099).
 *
 * The frame reads it (the host's `appShell` port, `iconBadge`), and two platforms have two sources,
 * which is not a style choice:
 * - **iOS** answers the live icon badge, which the app process can read directly.
 * - **Android** has no readable icon badge at all. notifee's badge API is a no-op off iOS and
 *   resolves a constant 0, and the launcher number is driven by the posted notification rather than
 *   by anything queryable. The real count lives in a native shared counter, reached by a separate
 *   bridge message.
 *
 * Where the frame has no icon badge to read — a browser — the answer is `null`.
 *
 * A failed round trip is `null` for that read only; the next read asks again.
 */
export interface INativeBadgeReader {
    /** The device's badge value, or `null` when this platform cannot answer. */
    read(): Promise<number | null>;
}

class NativeBadgeReader implements INativeBadgeReader {
    async read(): Promise<number | null> {
        const iconBadge = runtime.appShell.iconBadge;
        if (!iconBadge) return null;
        return iconBadge.read();
    }
}

export const nativeBadgeReader: INativeBadgeReader = new NativeBadgeReader();
