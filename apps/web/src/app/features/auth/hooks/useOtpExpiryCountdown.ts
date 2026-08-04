import { useEffect, useState } from 'react';

/** Second-precision tick — the OTP timer renders mm:ss. */
const TICK_MS = 1_000;

export interface OtpExpiryCountdown {
    /** Whole seconds until `expiredAt` (floored, never negative). */
    secondsLeft: number;
    /** True once now is at or past the expiry instant. */
    isExpired: boolean;
}

const compute = (expiredAt: number): OtpExpiryCountdown => {
    const secondsLeft = Math.max(0, Math.floor((expiredAt - Date.now()) / 1_000));
    return { secondsLeft, isExpired: secondsLeft <= 0 };
};

/**
 * Live countdown for an OTP's `expiredAt` (epoch ms, from the verify-hash-alias send/resend
 * response — the server value is the only truth, no client-side duration constant; ADR-0033 D9).
 * Returns `null` when no expiry is known yet (before the first send). A resend hands in a new
 * `expiredAt`, which restarts the ticking from the fresh server deadline.
 */
export const useOtpExpiryCountdown = (expiredAt?: number): OtpExpiryCountdown | null => {
    const [countdown, setCountdown] = useState<OtpExpiryCountdown | null>(() =>
        expiredAt ? compute(expiredAt) : null
    );

    useEffect(() => {
        if (!expiredAt) {
            setCountdown(null);
            return;
        }
        setCountdown(compute(expiredAt));
        const id = setInterval(() => {
            const next = compute(expiredAt);
            setCountdown(next);
            if (next.isExpired) clearInterval(id);
        }, TICK_MS);
        return () => clearInterval(id);
    }, [expiredAt]);

    return countdown;
};
