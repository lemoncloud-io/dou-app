import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type * as SharedModule from '../../../shared';

vi.mock('@chatic/theme', () => ({
    useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    VersionInfo: () => null,
}));
vi.mock('../hooks', () => ({
    useDevicePushMute: () => ({
        isSupported: false,
        pushEnabled: false,
        isPending: false,
        hasFailed: false,
        setPushEnabled: vi.fn(),
    }),
}));
vi.mock('../../chat/components/NotificationSnoozeButton', () => ({
    NotificationSnoozeButton: () => <p>snooze stub</p>,
}));

import '../../../../i18n';
import { useNotificationPrefsStore } from '../../../shared';
import { SettingsPage } from './SettingsPage';

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/settings']}>
            <SettingsPage />
        </MemoryRouter>
    );

describe('SettingsPage notifications', () => {
    beforeEach(() => {
        cleanup();
        useNotificationPrefsStore.setState({
            desktopEnabled: true,
            snoozeUntil: null,
            quietHours: null,
            mentionBreaksQuietHours: false,
        });
    });

    // The label text next to a switch is its name: clicking it flips the switch.
    it('toggles the desktop switch by its label text', () => {
        renderPage();

        fireEvent.click(screen.getByText('Desktop notifications'));

        expect(useNotificationPrefsStore.getState().desktopEnabled).toBe(false);
    });

    // Snooze lived in the sidebar only; the section that owns muting links it.
    it('links snooze from the notifications section', () => {
        renderPage();

        const snooze = screen.getByText('snooze stub');
        expect(snooze.closest('section')?.textContent).toContain('Notifications');
    });
});
