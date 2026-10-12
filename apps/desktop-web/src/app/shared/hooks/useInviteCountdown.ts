import { useEffect, useState } from 'react';

/** Remaining time is considered "imminent" (rendered red) at or below this many minutes. */
const IMMINENT_MINUTES = 10;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

export interface InviteCountdown {
    /** Whole days / hours / minutes / seconds remaining (never negative). */
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    /** True once now is at or past the expiry instant. */
    isExpired: boolean;
    /** True when close to expiry — the validity display turns red. */
    isImminent: boolean;
}

const compute = (expiredAt: number): InviteCountdown => {
    const remaining = Math.max(0, expiredAt - Date.now());
    // Round up, so zero is reserved for a link that really has expired: a live
    // link with 400ms left reads 1 second, not 0.
    const totalSeconds = Math.ceil(remaining / SECOND_MS);
    const totalMinutes = Math.floor(totalSeconds / 60);
    return {
        days: Math.floor(totalMinutes / (60 * 24)),
        hours: Math.floor((totalMinutes % (60 * 24)) / 60),
        minutes: totalMinutes % 60,
        seconds: totalSeconds % 60,
        isExpired: remaining <= 0,
        // Compared in ms, not in floored minutes — `totalMinutes <= 10` would
        // also be true at 10:59.
        isImminent: remaining > 0 && remaining <= IMMINENT_MINUTES * MINUTE_MS,
    };
};

/**
 * Live countdown for an invite link's `expiredAt` (epoch ms). Returns the
 * remaining day/hour/minute/second breakdown plus expired / imminent flags, or
 * `null` when no expiry is provided (the validity row is then hidden).
 *
 * Each tick lands just after the instant the displayed value next changes
 * rather than on a fixed interval, so a late-firing timer cannot freeze then
 * jump. Stops entirely at expiry. Unmount clears the pending tick.
 */
export const useInviteCountdown = (expiredAt?: number): InviteCountdown | null => {
    const [countdown, setCountdown] = useState<InviteCountdown | null>(() => (expiredAt ? compute(expiredAt) : null));

    useEffect(() => {
        if (!expiredAt) {
            setCountdown(null);
            return;
        }

        let timer: ReturnType<typeof setTimeout>;
        const schedule = () => {
            const next = compute(expiredAt);
            setCountdown(next);
            // Nothing left to count down to; leave the terminal value on screen.
            if (next.isExpired) return;

            const step = next.days > 0 ? MINUTE_MS : SECOND_MS;
            const remaining = expiredAt - Date.now();
            timer = setTimeout(schedule, remaining % step || step);
        };
        // Runs immediately as well as on a later `expiredAt` change, where the
        // useState initializer no longer applies.
        schedule();

        return () => clearTimeout(timer);
    }, [expiredAt]);

    return countdown;
};
