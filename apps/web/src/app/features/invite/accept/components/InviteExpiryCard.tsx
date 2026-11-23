import { useTranslation } from 'react-i18next';

import { IconClockSolid, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';
import type { InviteCountdown } from '../../hooks/useInviteCountdown';
import { formatCountdownClock, SPACED_CLOCK_SEPARATOR } from '../../utils/countdownClock';

interface InviteExpiryCardProps {
    countdown: InviteCountdown;
}

export const InviteExpiryCard = ({ countdown }: InviteExpiryCardProps) => {
    const { t } = useTranslation();
    const { days, hours, minutes, seconds, isExpired, isImminent } = countdown;
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
