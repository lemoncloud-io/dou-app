import type { InviteCountdown } from '../hooks/useInviteCountdown';

/** The clock's separator on the invite screens: a colon with a space either side (`03 : 20 : 05`). */
export const SPACED_CLOCK_SEPARATOR = ' : ';

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Remaining time as a clock — hours, minutes, seconds — with the days folded into the hours.
 *
 * Folded rather than shown as a day count because a clock has no day field: a link with more than a
 * day left reads `27 : 05 : 00`, never a wrapped `03 : 05 : 00`. Links this client issues live 24
 * hours, so the hours rarely pass 23 — but one issued elsewhere can live longer.
 *
 * The 1:1 room's footer prints it with a bare colon; the invite screens space it out.
 */
export const formatCountdownClock = (
    { days, hours, minutes, seconds }: Pick<InviteCountdown, 'days' | 'hours' | 'minutes' | 'seconds'>,
    separator = ':'
): string => [days * 24 + hours, minutes, seconds].map(pad).join(separator);
