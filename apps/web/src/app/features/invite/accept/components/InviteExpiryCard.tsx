import { useTranslation } from 'react-i18next';

import { IconClockSolid, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';
import type { InviteCountdown } from '../../hooks/useInviteCountdown';
import { formatCountdownClock, SPACED_CLOCK_SEPARATOR } from '../../utils/countdownClock';

interface InviteExpiryCardProps {
    /** Live remaining-time breakdown from useInviteCountdown. */
    countdown: InviteCountdown;
}

/**
 * Invite accept screen — the link validity block: a clock label and one line of remaining time
 * (Figma 3072-10943 / 3076-11341).
 *
 * Two granularities. More than ten minutes out it reads in words, from the first unit that is not
 * zero — `1일 2시간 5분`, `3시간 20분`, `45분` — which the countdown hook ticks by the minute. The last
 * ten minutes switch to a spaced clock counting by the second (`00 : 09 : 05`), in red, and an
 * expired link stays on `00 : 00 : 00` in red.
 */
export const InviteExpiryCard = ({ countdown }: InviteExpiryCardProps) => {
    const { t } = useTranslation();
    const { days, hours, minutes, seconds, isExpired, isImminent } = countdown;
    // `isImminent` is false once the deadline passes, so an expired link would otherwise read
    // "00:00:00 remaining" in the calm colour. Same pairing as InviteWaitingPage's `spent`.
    const spent = isExpired || isImminent;

    const remaining = spent
        ? formatCountdownClock({ days, hours, minutes, seconds }, SPACED_CLOCK_SEPARATOR)
        : [
              days > 0 && t('inviteAccept.expiry.days', { n: days }),
              (days > 0 || hours > 0) && t('inviteAccept.expiry.hours', { n: hours }),
              t('inviteAccept.expiry.minutes', { n: minutes }),
          ]
              .filter(Boolean)
              .join(' ');

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
