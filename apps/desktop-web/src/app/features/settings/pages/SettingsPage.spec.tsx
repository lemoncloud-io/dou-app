import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type * as AppRuntimeModule from '@chatic/app-runtime';

import type * as SharedModule from '../../../shared';

const pairingEnv = vi.hoisted(() => ({ native: false, paired: false }));

vi.mock('@chatic/app-runtime', async () => {
    const actual = await vi.importActual<typeof AppRuntimeModule>('@chatic/app-runtime');
    return {
        ...actual,
        runtime: {
            ...actual.runtime,
            session: { ...actual.runtime.session, useIsPairedSession: () => pairingEnv.paired },
        },
    };
});
// The flag and the platform, as `canApprovePairing` reads them; the paired session is the page's to pass.
vi.mock('../../pairing/utils/devicePairing', () => ({
    canApprovePairing: (isPairedSession: boolean) => pairingEnv.native && !isPairedSession,
}));

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

    // Start = end silences nothing: the empty window is explained in a live
    // region both time inputs point at, instead of an alert that toggles.
    it('announces the empty quiet window off both time inputs', () => {
        useNotificationPrefsStore.setState({ quietHours: { start: '22:00', end: '22:00' } });
        renderPage();

        const note = screen.getByText('Start and end are the same, so nothing is silenced.');
        expect(note.getAttribute('aria-live')).toBe('polite');
        expect(note.getAttribute('role')).toBeNull();
        const windowId = note.getAttribute('id');
        expect(windowId).toBeTruthy();
        for (const label of ['From', 'To']) {
            expect(screen.getByLabelText(label).getAttribute('aria-describedby')).toBe(windowId);
        }
    });

    // The two time inputs are one group with one name, not two stray fields.
    it('groups the quiet-hours times under one name', () => {
        useNotificationPrefsStore.setState({ quietHours: { start: '22:00', end: '07:00' } });
        renderPage();

        const group = screen.getByRole('group', { name: 'Quiet hours window' });
        expect(group.querySelectorAll('input[type="time"]')).toHaveLength(2);
    });

    // The window prints the locale clock, the same clock the snooze label uses.
    it('prints the quiet window on the locale clock', () => {
        useNotificationPrefsStore.setState({ quietHours: { start: '22:00', end: '07:00' } });
        renderPage();

        expect(screen.getByText(/10:00 PM.*7:00 AM/)).toBeTruthy();
    });
});

describe('SettingsPage web sign-in approval entry', () => {
    beforeEach(() => {
        cleanup();
        pairingEnv.native = true;
        pairingEnv.paired = false;
    });

    const renderWithApproval = () =>
        render(
            <MemoryRouter initialEntries={['/settings']}>
                <Routes>
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/settings/pairing/approve" element={<p>approve page</p>} />
                </Routes>
            </MemoryRouter>
        );

    it('opens the approval screen from the desktop app', () => {
        renderWithApproval();

        fireEvent.click(screen.getByRole('button', { name: /Approve web sign-in/ }));

        expect(screen.getByText('approve page')).toBeTruthy();
    });

    it('is not offered in a browser', () => {
        pairingEnv.native = false;
        renderWithApproval();

        expect(screen.queryByText('Approve web sign-in')).toBeNull();
    });

    it('is not offered to a session that was itself paired', () => {
        pairingEnv.paired = true;
        renderWithApproval();

        expect(screen.queryByText('Approve web sign-in')).toBeNull();
    });
});
