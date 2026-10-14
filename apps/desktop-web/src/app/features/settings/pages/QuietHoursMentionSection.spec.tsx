import { beforeEach, describe, expect, it } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import '../../../../i18n';

import { useNotificationPrefsStore } from '../../../shared';
import { QuietHoursMentionSection } from './QuietHoursMentionSection';

describe('QuietHoursMentionSection', () => {
    beforeEach(() => {
        cleanup();
        useNotificationPrefsStore.setState({ quietHours: null, mentionBreaksQuietHours: false });
    });

    it('renders nothing while quiet hours are off', () => {
        render(<QuietHoursMentionSection />);
        expect(screen.queryByRole('switch')).toBeNull();
    });

    it('shows the toggle once quiet hours are set, off by default', () => {
        useNotificationPrefsStore.setState({ quietHours: { start: '22:00', end: '07:00' } });
        render(<QuietHoursMentionSection />);

        expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    });

    it('stores the toggle', () => {
        useNotificationPrefsStore.setState({ quietHours: { start: '22:00', end: '07:00' } });
        render(<QuietHoursMentionSection />);

        fireEvent.click(screen.getByRole('switch'));

        expect(useNotificationPrefsStore.getState().mentionBreaksQuietHours).toBe(true);
    });
});
