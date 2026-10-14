import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';

import '../../../../i18n';

import { formatClockTime, useNotificationPrefsStore } from '../../../shared';
import { NotificationSnoozeButton } from './NotificationSnoozeButton';

const navigate = vi.fn();
vi.mock('react-router-dom', async importOriginal => ({
    ...(await importOriginal<object>()),
    useNavigate: () => navigate,
}));

const QUIET = { start: '22:00', end: '07:00' };

describe('NotificationSnoozeButton', () => {
    beforeEach(() => {
        cleanup();
        // Inside the quiet-hours window below.
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
        vi.setSystemTime(new Date(2026, 9, 14, 23, 0));
        useNotificationPrefsStore.setState({ snoozeUntil: null, quietHours: null, mentionBreaksQuietHours: false });
        navigate.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const label = () => screen.getByRole('button').textContent;

    it('offers to pause when nothing is muting', () => {
        render(<NotificationSnoozeButton />);
        expect(label()).toBe(i18next.t('snooze.title'));
    });

    it('says quiet hours mute everything while the breakthrough is off', () => {
        useNotificationPrefsStore.setState({ quietHours: QUIET });
        render(<NotificationSnoozeButton />);
        expect(label()).toBe(i18next.t('snooze.activeQuiet'));
    });

    it('says mentions that name me still come through while the breakthrough is on', () => {
        useNotificationPrefsStore.setState({ quietHours: QUIET, mentionBreaksQuietHours: true });
        render(<NotificationSnoozeButton />);
        expect(label()).toBe(i18next.t('snooze.activeQuietMention'));
    });

    // A snooze is never broken through, so its label wins over the breakthrough's.
    it('names the snooze end over the breakthrough while snoozed', () => {
        useNotificationPrefsStore.setState({
            snoozeUntil: new Date(2026, 9, 15, 0, 30).getTime(),
            quietHours: QUIET,
            mentionBreaksQuietHours: true,
        });
        render(<NotificationSnoozeButton />);
        expect(label()).not.toBe(i18next.t('snooze.activeQuietMention'));
        expect(label()).not.toBe(i18next.t('snooze.activeQuiet'));
    });

    // An expired snooze is over: with quiet hours on, the quiet label shows — never a past time.
    it('never shows a past snooze time once quiet hours carry the silence', () => {
        useNotificationPrefsStore.setState({
            snoozeUntil: new Date(2026, 9, 14, 22, 0).getTime(),
            quietHours: QUIET,
        });
        render(<NotificationSnoozeButton />);
        expect(label()).toBe(i18next.t('snooze.activeQuiet'));
    });

    const openMenu = async () => {
        // Radix opens the menu on Enter with the trigger focused; a bare click
        // never reaches it in jsdom. Real timers: the portal mounts async.
        vi.useRealTimers();
        const trigger = screen.getByRole('button');
        trigger.focus();
        fireEvent.keyDown(trigger, { key: 'Enter' });
        await screen.findByText(i18next.t('snooze.30m'));
    };

    it('hides the turn-off item once the snooze has passed', async () => {
        useNotificationPrefsStore.setState({ snoozeUntil: new Date(2026, 9, 14, 22, 0).getTime() });
        render(<NotificationSnoozeButton />);
        await openMenu();
        expect(screen.queryByText(i18next.t('snooze.off'))).toBeNull();
    });

    it('offers the turn-off item while snoozed', async () => {
        useNotificationPrefsStore.setState({ snoozeUntil: new Date(2026, 9, 15, 0, 30).getTime() });
        render(<NotificationSnoozeButton />);
        await openMenu();
        expect(screen.getByText(i18next.t('snooze.off'))).toBeTruthy();
    });

    it('flips back to off once the snooze passes, with no store write in between', async () => {
        const now = new Date(2026, 9, 14, 23, 0).getTime();
        const until = now + 30 * 60_000;
        useNotificationPrefsStore.setState({ snoozeUntil: until });
        render(<NotificationSnoozeButton />);
        expect(label()).toBe(i18next.t('snooze.activeUntil', { time: formatClockTime(until) }));

        await act(async () => {
            vi.advanceTimersByTime(31 * 60_000);
        });
        expect(label()).toBe(i18next.t('snooze.title'));
        expect(useNotificationPrefsStore.getState().snoozeUntil).toBeNull();
    });

    it('opens the notification settings from the menu', async () => {
        render(<NotificationSnoozeButton />);
        await openMenu();
        fireEvent.click(screen.getByText(i18next.t('snooze.settings')));
        expect(navigate).toHaveBeenCalledWith('/settings');
    });
});
