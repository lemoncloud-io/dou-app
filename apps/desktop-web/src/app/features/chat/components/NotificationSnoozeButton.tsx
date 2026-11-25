import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Bell, BellOff } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit';

import {
    formatClockTime,
    isDndActive,
    isSnoozed,
    nextDndBoundary,
    nextSnoozeUntilTomorrow,
    useNotificationPrefsStore,
} from '../../../shared';
import { SIDEBAR_ACTION_ROW } from './sidebarStyles';

const MINUTE = 60_000;

interface NotificationSnoozeButtonProps {
    variant?: 'row' | 'icon';
}

export const NotificationSnoozeButton = ({ variant = 'row' }: NotificationSnoozeButtonProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const snoozeUntil = useNotificationPrefsStore(s => s.snoozeUntil);
    const quietHours = useNotificationPrefsStore(s => s.quietHours);
    const breakthrough = useNotificationPrefsStore(s => s.mentionBreaksQuietHours);
    const setSnooze = useNotificationPrefsStore(s => s.setSnooze);

    const active = isDndActive({ snoozeUntil, quietHours });
    const snoozed = snoozeUntil != null && isSnoozed(snoozeUntil);
    const snoozeFor = (minutes: number) => setSnooze(Date.now() + minutes * MINUTE);
    const labelKey = !active
        ? 'snooze.title'
        : snoozed
          ? 'snooze.activeUntil'
          : breakthrough
            ? 'snooze.activeQuietMention'
            : 'snooze.activeQuiet';

    const boundary = nextDndBoundary({ snoozeUntil, quietHours });
    const [, setTick] = useState(0);
    useEffect(() => {
        if (boundary == null) return;
        const timer = setTimeout(() => setTick(tick => tick + 1), Math.max(boundary - Date.now(), 0));
        return () => clearTimeout(timer);
    }, [boundary]);
    useEffect(() => {
        if (snoozeUntil != null && !isSnoozed(snoozeUntil)) setSnooze(null);
    }, [snoozeUntil, boundary, setSnooze]);

    const label = t(labelKey, snoozed && snoozeUntil ? { time: formatClockTime(snoozeUntil) } : undefined);
    const bell = active ? (
        <BellOff size={18} aria-hidden className="text-primary-ink" />
    ) : (
        <Bell size={18} aria-hidden />
    );

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {variant === 'icon' ? (
                    <button
                        type="button"
                        aria-label={label}
                        className="focus-ring tactile flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                    >
                        {bell}
                    </button>
                ) : (
                    <button type="button" className={SIDEBAR_ACTION_ROW}>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md">{bell}</span>
                        <span className="truncate">{label}</span>
                    </button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align={variant === 'icon' ? 'end' : 'start'} className="w-56 shadow-overlay">
                <DropdownMenuLabel className="text-muted-foreground">{label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => snoozeFor(30)} className="cursor-pointer py-2">
                    {t('snooze.30m')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => snoozeFor(60)} className="cursor-pointer py-2">
                    {t('snooze.1h')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => snoozeFor(120)} className="cursor-pointer py-2">
                    {t('snooze.2h')}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setSnooze(nextSnoozeUntilTomorrow(Date.now()))}
                    className="cursor-pointer py-2"
                >
                    {t('snooze.tomorrow')}
                </DropdownMenuItem>
                {snoozed && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSnooze(null)} className="cursor-pointer py-2">
                            {t('snooze.off')}
                        </DropdownMenuItem>
                    </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer py-2">
                    {t('snooze.settings')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
