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
    /** True when close to expiry — the card turns red. */
    isImminent: boolean;
}

const compute = (expiredAt: number): InviteCountdown => {
    const remaining = Math.max(0, expiredAt - Date.now());
    // Round up, so `00:00:00` is reserved for a link that really has expired: a live link with 400ms
    // left reads 00:00:01, not 00:00:00.
    const totalSeconds = Math.ceil(remaining / SECOND_MS);
    const totalMinutes = Math.floor(totalSeconds / 60);
    return {
        days: Math.floor(totalMinutes / (60 * 24)),
        hours: Math.floor((totalMinutes % (60 * 24)) / 60),
        minutes: totalMinutes % 60,
        seconds: totalSeconds % 60,
        isExpired: remaining <= 0,
        // Compared in ms, not in floored minutes — `totalMinutes <= 10` would also be true at 10:59,
        // which is visible now that the card counts by the second.
        isImminent: remaining > 0 && remaining <= IMMINENT_MINUTES * MINUTE_MS,
    };
};

export interface InviteCountdownOptions {
    /**
     * Tick by the minute until the last ten minutes, then by the second. For a screen that shows
     * minutes until the countdown turns imminent (the accept screen); left off, it ticks every second.
     */
    minuteUntilImminent?: boolean;
}

/**
 * Live countdown for an invite link's `expiredAt` (epoch ms). Returns the remaining
 * day/hour/minute/second breakdown plus expired / imminent flags, or `null` when no expiry is
 * provided (the validity card is then hidden).
 *
 * The lifetime is the record's: links this client issues live 24 hours, while the server's own
 * default — what a link issued without one gets — is 3 days. So the day field can be non-zero, and
 * the caller decides how to show it: the accept screen reads `n days n hours n minutes` until the last
 * ten minutes and a clock after; the waiting screen and the 1:1 strip are a clock throughout.
 *
 * The tick follows what is on screen: every second by default, or by the minute until the last ten
 * minutes when `minuteUntilImminent` is set, and it stops entirely at expiry — the same
 * self-terminating shape as `useOtpExpiryCountdown`. Each tick is scheduled onto the instant the
 * displayed value next changes rather than on a fixed interval, so a late-firing timer can't make the
 * seconds freeze for two ticks and then jump by two.
 */
export const useInviteCountdown = (
    expiredAt?: number,
    { minuteUntilImminent = false }: InviteCountdownOptions = {}
): InviteCountdown | null => {
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

            const remaining = expiredAt - Date.now();
            // The display ticks in step with `expiredAt`, not with the wall clock, so land on its next
            // boundary; `|| step` covers landing exactly on one. Seconds round up, so a second turns
            // over at a whole-second remainder — and a minute, being read off those seconds, a second
            // before a whole-minute one. A minute tick also never sleeps past the imminent edge, where
            // the second tick takes over.
            const delay =
                minuteUntilImminent && !next.isImminent
                    ? Math.min(
                          (remaining + SECOND_MS) % MINUTE_MS || MINUTE_MS,
                          remaining - IMMINENT_MINUTES * MINUTE_MS
                      )
                    : remaining % SECOND_MS || SECOND_MS;
            timer = setTimeout(schedule, delay);
        };
        // Runs immediately as well as on a later `expiredAt` change, where the useState initializer
        // no longer applies.
        schedule();

        return () => clearTimeout(timer);
    }, [expiredAt, minuteUntilImminent]);

    return countdown;
};
