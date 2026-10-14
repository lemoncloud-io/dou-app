import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, render, screen } from '@testing-library/react';
import i18next from 'i18next';

import '../../../../i18n';

import { useNotificationPrefsStore } from '../../../shared';
import { NotificationSnoozeButton } from './NotificationSnoozeButton';

const QUIET = { start: '22:00', end: '07:00' };

describe('NotificationSnoozeButton', () => {
    beforeEach(() => {
        cleanup();
        // Inside the quiet-hours window below.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 14, 23, 0));
        useNotificationPrefsStore.setState({ snoozeUntil: null, quietHours: null, mentionBreaksQuietHours: false });
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
});
