import { useEffect, useState } from 'react';

/** Remaining time is considered "imminent" (rendered red) at or below this many minutes. */
const IMMINENT_MINUTES = 10;
/** Re-evaluate every 30s: the UI shows minute granularity, so this is precise enough. */
const TICK_MS = 30_000;

export interface InviteCountdown {
    /** Whole days / hours / minutes remaining (floored, never negative). */
    days: number;
    hours: number;
    minutes: number;
    /** True once now is at or past the expiry instant. */
    isExpired: boolean;
    /** True when close to expiry — the card turns red. */
    isImminent: boolean;
}

const compute = (expiredAt: number): InviteCountdown => {
    const remaining = Math.max(0, expiredAt - Date.now());
    const totalMinutes = Math.floor(remaining / 60_000);
    return {
        days: Math.floor(totalMinutes / (60 * 24)),
        hours: Math.floor((totalMinutes % (60 * 24)) / 60),
        minutes: totalMinutes % 60,
        isExpired: remaining <= 0,
        isImminent: remaining > 0 && totalMinutes <= IMMINENT_MINUTES,
    };
};

/**
 * Live countdown for an invite link's `expiredAt` (epoch ms). Ticks every 30s and returns the
 * remaining day/hour/minute breakdown plus expired / imminent flags. Returns `null` when no expiry
 * is provided (the validity card is then hidden). Invite links live at most ~30min, so the day/hour
 * fields are usually zero — the caller formats what to show.
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
