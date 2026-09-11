import { useTranslation } from 'react-i18next';

import { Bell, BellOff } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { isDndActive, nextSnoozeUntilTomorrow, useNotificationPrefsStore } from '../../../shared';
import { SIDEBAR_ACTION_ROW } from './sidebarStyles';

const MINUTE = 60_000;

const formatTime = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Sidebar action row to snooze notifications (global do-not-disturb). Self-contained:
 * reads/writes the notification-prefs store directly, no prop drilling. The row
 * reads the current state (off / snoozed until / quiet hours) with a muted bell.
 */
export const NotificationSnoozeButton = () => {
    const { t } = useTranslation();
    const snoozeUntil = useNotificationPrefsStore(s => s.snoozeUntil);
    const quietHours = useNotificationPrefsStore(s => s.quietHours);
    const setSnooze = useNotificationPrefsStore(s => s.setSnooze);

    const active = isDndActive({ snoozeUntil, quietHours });
    const snoozeFor = (minutes: number) => setSnooze(Date.now() + minutes * MINUTE);
    // Three exclusive states, read top-down: off → snoozed (with time) → quiet hours.
    const labelKey = !active ? 'snooze.title' : snoozeUntil ? 'snooze.activeUntil' : 'snooze.activeQuiet';

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
                        {t(labelKey, snoozeUntil ? { time: formatTime(snoozeUntil) } : undefined)}
                    </span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 shadow-overlay">
                <DropdownMenuLabel className="text-muted-foreground">
                    {t(labelKey, snoozeUntil ? { time: formatTime(snoozeUntil) } : undefined)}
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
                {snoozeUntil != null && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSnooze(null)} className="cursor-pointer py-2">
                            {t('snooze.off')}
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
