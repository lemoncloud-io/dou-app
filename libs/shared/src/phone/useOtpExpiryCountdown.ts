import { useEffect, useState } from 'react';

const TICK_MS = 1_000;

export interface OtpExpiryCountdown {
    secondsLeft: number;
    isExpired: boolean;
}

const compute = (expiredAt: number): OtpExpiryCountdown => {
    const secondsLeft = Math.max(0, Math.floor((expiredAt - Date.now()) / 1_000));
    return { secondsLeft, isExpired: secondsLeft <= 0 };
};

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
