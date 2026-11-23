import type { InviteCountdown } from '../hooks/useInviteCountdown';

export const SPACED_CLOCK_SEPARATOR = ' : ';

const pad = (n: number): string => String(n).padStart(2, '0');

export const formatCountdownClock = (
    { days, hours, minutes, seconds }: Pick<InviteCountdown, 'days' | 'hours' | 'minutes' | 'seconds'>,
    separator = ':'
): string => [days * 24 + hours, minutes, seconds].map(pad).join(separator);
