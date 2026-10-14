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
} from '@chatic/ui-kit/components/ui/dropdown-menu';

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

/**
 * Sidebar action row to snooze notifications (global do-not-disturb). Self-contained:
 * reads/writes the notification-prefs store directly, no prop drilling. The row
 * reads the current state (off / snoozed until / quiet hours) with a muted bell.
 */
export const NotificationSnoozeButton = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const snoozeUntil = useNotificationPrefsStore(s => s.snoozeUntil);
    const quietHours = useNotificationPrefsStore(s => s.quietHours);
    const breakthrough = useNotificationPrefsStore(s => s.mentionBreaksQuietHours);
    const setSnooze = useNotificationPrefsStore(s => s.setSnooze);

    const active = isDndActive({ snoozeUntil, quietHours });
    // Set is not live: an expired value reads as a snooze until something else
    // writes. The truth is whether it is still in the future.
    const snoozed = snoozeUntil != null && isSnoozed(snoozeUntil);
    const snoozeFor = (minutes: number) => setSnooze(Date.now() + minutes * MINUTE);
    // Four exclusive states, read top-down: off → snoozed (with time) → quiet hours
    // with the breakthrough on → quiet hours.
    const labelKey = !active
        ? 'snooze.title'
        : snoozed
          ? 'snooze.activeUntil'
          : breakthrough
            ? 'snooze.activeQuietMention'
            : 'snooze.activeQuiet';

    // Wake on the next boundary — a snooze end or a quiet-hours edge — so the
    // label turns over without another store write. One shot: each render names
    // the next one.
    const boundary = nextDndBoundary({ snoozeUntil, quietHours });
    const [, setTick] = useState(0);
    useEffect(() => {
        if (boundary == null) return;
        const timer = setTimeout(() => setTick(tick => tick + 1), Math.max(boundary - Date.now(), 0));
        return () => clearTimeout(timer);
    }, [boundary]);
    // An expired value left in the store reads as a snooze to anything checking
    // for set-ness; clear it once it passes.
    useEffect(() => {
        if (snoozeUntil != null && !isSnoozed(snoozeUntil)) setSnooze(null);
    }, [snoozeUntil, boundary, setSnooze]);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button type="button" className={SIDEBAR_ACTION_ROW}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                        {active ? (
                            <BellOff size={18} aria-hidden className="text-primary-ink" />
                        ) : (
                            <Bell size={18} aria-hidden />
                        )}
                    </span>
                    <span className="truncate">
                        {t(labelKey, snoozed && snoozeUntil ? { time: formatClockTime(snoozeUntil) } : undefined)}
                    </span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 shadow-overlay">
                <DropdownMenuLabel className="text-muted-foreground">
                    {t(labelKey, snoozed && snoozeUntil ? { time: formatClockTime(snoozeUntil) } : undefined)}
                </DropdownMenuLabel>
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
