import type { OnUpdateStatusPayload } from '@chatic/bridge-messages';

export const CHECK_INTERVAL_MS = 30 * 60 * 1_000;

export const MIN_CHECK_GAP_MS = 10 * 60 * 1_000;

export interface UpdateCheckGate {
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

export const isBusy = (status: OnUpdateStatusPayload['status'] | undefined): boolean =>
    status === 'downloading' || status === 'downloaded';
