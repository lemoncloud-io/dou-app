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

const MINUTE = 60_000;

const formatTime = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Sidebar action to snooze notifications (global do-not-disturb). Self-contained:
 * reads/writes the notification-prefs store directly, no prop drilling. The bell
 * shows muted while a snooze or quiet-hours window is active.
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
                <button
                    type="button"
                    title={t('snooze.title')}
                    aria-label={t('snooze.title')}
                    className="focus-ring tactile relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground aria-expanded:bg-accent"
                >
                    {active ? (
                        <BellOff size={16} aria-hidden className="text-primary" />
                    ) : (
                        <Bell size={16} aria-hidden />
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 shadow-overlay">
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
