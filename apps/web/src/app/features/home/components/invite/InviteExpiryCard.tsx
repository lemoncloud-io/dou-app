import { useTranslation } from 'react-i18next';

import { IconClockSolid, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';
import type { InviteCountdown } from '../../hooks';

interface InviteExpiryCardProps {
    /** Live remaining-time breakdown from useInviteCountdown. */
    countdown: InviteCountdown;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Invite accept screen — the link validity block: a clock label and one line of remaining time,
 * reddened once the link is spent (Figma 3072-10943 / 3076-11341).
 *
 * Two granularities, because the design's `HH:mm:ss` assumes under a day while the server issues
 * 3-day links (ADR-0033 D8 · ADR-0037): a day or more out reads "2일 5시간", and the last day counts
 * down by the second exactly as designed.
 */
export const InviteExpiryCard = ({ countdown }: InviteExpiryCardProps) => {
    const { t } = useTranslation();
    const { days, hours, minutes, seconds, isExpired, isImminent } = countdown;
    // `isImminent` is false once the deadline passes, so an expired link would otherwise read
    // "00:00:00 남음" in the calm colour. Same pairing as InviteWaitingPage's `spent`.
    const spent = isExpired || isImminent;

    const remaining =
        days > 0
            ? [t('inviteAccept.expiry.days', { n: days }), hours > 0 && t('inviteAccept.expiry.hours', { n: hours })]
                  .filter(Boolean)
                  .join(' ')
            : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return (
        <InviteCard className="w-auto gap-2 px-8 py-[18px]">
            <div className="flex items-center gap-1.5">
                <IconClockSolid size={20} className="text-description" />
                <Text as="p" className="text-[16px] font-semibold leading-[1.4] text-foreground">
                    {t('inviteAccept.expiry.label')}
                </Text>
            </div>
            <Text
                as="p"
                className={`text-[14px] font-medium leading-[1.4] ${spent ? 'text-destructive' : 'text-label'}`}
            >
                {t('inviteAccept.expiry.remaining', { time: remaining })}
            </Text>
        </InviteCard>
    );
};
