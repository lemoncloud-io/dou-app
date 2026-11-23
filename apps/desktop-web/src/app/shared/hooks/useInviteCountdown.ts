import { useEffect, useState } from 'react';

const IMMINENT_MINUTES = 10;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

export interface InviteCountdown {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
    isImminent: boolean;
}

const compute = (expiredAt: number): InviteCountdown => {
    const remaining = Math.max(0, expiredAt - Date.now());
    const totalSeconds = Math.ceil(remaining / SECOND_MS);
    const totalMinutes = Math.floor(totalSeconds / 60);
    return {
        days: Math.floor(totalMinutes / (60 * 24)),
        hours: Math.floor((totalMinutes % (60 * 24)) / 60),
        minutes: totalMinutes % 60,
        seconds: totalSeconds % 60,
        isExpired: remaining <= 0,
        isImminent: remaining > 0 && remaining <= IMMINENT_MINUTES * MINUTE_MS,
    };
};

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
            if (next.isExpired) return;

            const step = next.days > 0 ? MINUTE_MS : SECOND_MS;
            const remaining = expiredAt - Date.now();
            timer = setTimeout(schedule, remaining % step || step);
        };
        schedule();

        return () => clearTimeout(timer);
    }, [expiredAt]);

    return countdown;
};
