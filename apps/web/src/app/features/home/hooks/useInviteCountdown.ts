import { useEffect, useState } from 'react';

/** Remaining time is considered "imminent" (rendered red) at or below this many minutes. */
const IMMINENT_MINUTES = 10;
/** Re-evaluate every second: the accept screen counts down in `HH:mm:ss` under a day. */
const TICK_MS = 1_000;

export interface InviteCountdown {
    /** Whole days / hours / minutes / seconds remaining (floored, never negative). */
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    /** True once now is at or past the expiry instant. */
    isExpired: boolean;
    /** True when close to expiry — the card turns red. */
    isImminent: boolean;
}

const compute = (expiredAt: number): InviteCountdown => {
    const remaining = Math.max(0, expiredAt - Date.now());
    const totalSeconds = Math.floor(remaining / 1_000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    return {
        days: Math.floor(totalMinutes / (60 * 24)),
        hours: Math.floor((totalMinutes % (60 * 24)) / 60),
        minutes: totalMinutes % 60,
        seconds: totalSeconds % 60,
        isExpired: remaining <= 0,
        isImminent: remaining > 0 && totalMinutes <= IMMINENT_MINUTES,
    };
};

/**
 * Live countdown for an invite link's `expiredAt` (epoch ms). Ticks every second and returns the
 * remaining day/hour/minute/second breakdown plus expired / imminent flags. Returns `null` when no
 * expiry is provided (the validity card is then hidden).
 *
 * Invite links live **3 days** (server-side, ADR-0033 D8), so the day/hour fields are usually the
 * meaningful ones and the caller decides which granularity to show — the accept screen switches to
 * `HH:mm:ss` only inside the last day (ADR-0037).
 */
export const useInviteCountdown = (expiredAt?: number): InviteCountdown | null => {
    const [countdown, setCountdown] = useState<InviteCountdown | null>(() => (expiredAt ? compute(expiredAt) : null));

    useEffect(() => {
        if (!expiredAt) {
            setCountdown(null);
            return;
        }
        setCountdown(compute(expiredAt));
        const id = setInterval(() => setCountdown(compute(expiredAt)), TICK_MS);
        return () => clearInterval(id);
    }, [expiredAt]);

    return countdown;
};
