/**
 * How often the shell asks the update feed. A release should reach an app that has been open all day
 * without a restart. At 6 hours, a version published in the afternoon was not seen until evening.
 * The feed is one small `latest*.yml` served `no-cache`, so asking often costs next to nothing.
 *
 * Deliberately imports no electron: this runs under jest, which cannot load electron.
 */
import type { OnUpdateStatusPayload } from '@chatic/app-messages';

/** The steady re-check for an app left open and in the background. */
export const CHECK_INTERVAL_MS = 30 * 60 * 1_000;

/** The least time between two checks, whatever asks: focus fires on every alt-tab. */
export const MIN_CHECK_GAP_MS = 10 * 60 * 1_000;

export interface UpdateCheckGate {
    /** True, and the gap restarts, when enough time has passed since the last allowed check. */
    shouldCheck: () => boolean;
}

export const createUpdateCheckGate = ({
    minGapMs,
    now = Date.now,
}: {
    minGapMs: number;
    now?: () => number;
}): UpdateCheckGate => {
    let lastAllowedAt: number | null = null;
    return {
        shouldCheck: () => {
            const time = now();
            if (lastAllowedAt !== null && time - lastAllowedAt < minGapMs) return false;
            lastAllowedAt = time;
            return true;
        },
    };
};

/**
 * No check while an update is downloading or ready to install. With `autoDownload` off, a check
 * re-emits `update-available`, and the banner would drop from "downloading" or "restart to update"
 * back to the offer.
 */
export const isBusy = (status: OnUpdateStatusPayload['status'] | undefined): boolean =>
    status === 'downloading' || status === 'downloaded';
