import { useTranslation } from 'react-i18next';

import { IconClock, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';
import type { InviteCountdown } from '../../hooks';

interface InviteExpiryCardProps {
    /** Expiry epoch (ms) — shown as the absolute deadline. */
    expiredAt: number;
    /** Live remaining-time breakdown from useInviteCountdown. */
    countdown: InviteCountdown;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Format an epoch to `YYYY.MM.DD HH:mm` in local time. */
const formatDeadline = (epoch: number): string => {
    const d = new Date(epoch);
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Invite accept screen — the link validity block: a clock label, the absolute deadline, and the live
 * "n days n hours n minutes left" countdown. The remaining line turns red when expiry is imminent.
 * Invite links live at most ~30min, so day/hour parts are dropped when zero.
 */
export const InviteExpiryCard = ({ expiredAt, countdown }: InviteExpiryCardProps) => {
    const { t } = useTranslation();
    const { days, hours, minutes, isImminent } = countdown;

    const parts: string[] = [];
    if (days > 0) parts.push(t('inviteAccept.expiry.days', { n: days }));
    if (hours > 0) parts.push(t('inviteAccept.expiry.hours', { n: hours }));
    parts.push(t('inviteAccept.expiry.minutes', { n: minutes }));

    return (
        <InviteCard className="w-auto gap-3 px-8 py-[18px]">
            <div className="flex items-center gap-1.5">
                <IconClock size={20} className="text-foreground" />
                <Text as="p" className="text-[16px] font-semibold leading-[1.4] text-foreground">
                    {t('inviteAccept.expiry.label')}
                </Text>
            </div>
            <div className="flex flex-col items-center gap-1">
                <Text as="p" className="text-[14px] font-medium leading-[1.4] text-description">
                    {formatDeadline(expiredAt)}
                </Text>
                <Text
                    as="p"
                    className={`text-[13px] font-medium leading-[1.4] ${isImminent ? 'text-destructive' : 'text-placeholder'}`}
                >
                    {t('inviteAccept.expiry.remaining', { time: parts.join(' ') })}
                </Text>
            </div>
        </InviteCard>
    );
};
