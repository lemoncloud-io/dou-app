import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type * as ChaticSharedModule from '@chatic/shared';

const tokenUser = vi.hoisted(() => ({
    value: null as { name?: string; photo?: string; userRole?: string } | null,
}));
const patchRelaySessionUser = vi.hoisted(() => vi.fn());
const gatewayUpdate = vi.fn(async (data: unknown) => data);

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: {
            RELAY_SLOT: 'relay',
            useSlotVerified: () => true,
        },
        session: {
            useGlobalSession: () => 0,
            getRelaySessionUser: () => tokenUser.value,
            patchRelaySessionUser: (...args: unknown[]) => patchRelaySessionUser(...args),
        },
    },
}));

vi.mock('../../../shared/runtime/relayAccountGateway', () => ({
    getRelayAccountGateway: () => ({
        profile: vi.fn(async () => ({})),
        update: (...args: unknown[]) => gatewayUpdate(...args),
    }),
    resetRelayAccountGateway: vi.fn(),
}));

const prepareImage = vi.hoisted(() => vi.fn());
vi.mock('@chatic/shared', async () => ({
    ...(await vi.importActual<ChaticSharedModule>('@chatic/shared')),
    prepareImage,
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));

const pairingEnabled = vi.hoisted(() => ({ value: true }));
vi.mock('../../pairing/utils/devicePairing', () => ({ isDevicePairingEnabled: () => pairingEnabled.value }));

const startSocialLogin = vi.hoisted(() => vi.fn());
vi.mock('../../auth', () => ({
    GoogleIcon: () => null,
    PHONE_BUTTON_CLASS: '',
    isSocialLoginEnabled: () => true,
    isPhoneLoginEnabled: () => true,
    phoneSignupNoteKey: () => 'auth.social.phoneSignupNote',
    useSocialLogin: () => ({ start: startSocialLogin, isStarting: false }),
    useAttemptExpired: () => false,
    useOAuthAttemptStore: <T,>(select: (s: { attempt: null; failed: boolean; linkFailure: null }) => T) =>
        select({ attempt: null, failed: false, linkFailure: null }),
    selectAttemptBusy: () => false,
}));

import '../../../../i18n';

import { AccountHubPage } from './AccountHubPage';

const renderAt = () =>
    render(
        <MemoryRouter initialEntries={['/account']}>
            <Routes>
                <Route path="/account" element={<AccountHubPage />} />
                <Route path="/settings" element={<div data-testid="settings" />} />
                <Route path="*" element={<div data-testid="away" />} />
            </Routes>
        </MemoryRouter>
    );

describe('AccountHubPage', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        tokenUser.value = null;
        pairingEnabled.value = true;
        gatewayUpdate.mockImplementation(async (data: unknown) => data);
        prepareImage.mockResolvedValue({ avatar: 'data:image/jpeg;base64,NEW' });
    });

    it('shows the relay account with its photo', () => {
        tokenUser.value = { name: 'Ada', photo: 'data:image/jpeg;base64,OLD' };
        renderAt();

        expect(screen.getByText('Ada')).toBeTruthy();
    });

    it('shows an account whose name is a bare UUID as unnamed, and does not prefill the edit with it', () => {
        tokenUser.value = { name: 'a0a260da-f3d9-45e9-86cb-a4f225c2861c' };
        renderAt();

        expect(screen.getByText('Unnamed account')).toBeTruthy();
        expect(screen.queryByText('a0a260da-f3d9-45e9-86cb-a4f225c2861c')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
        expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('');
    });

    it('invites a guest to join instead of showing an empty card', () => {
        renderAt();

        expect(screen.getByText('Guest account')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });

    // A guest has a relay user too — its role is what says it is a guest.
    it('treats a relay user whose role is guest as a guest, and offers Google sign-in', () => {
        tokenUser.value = { name: 'Guest', userRole: 'guest' } as typeof tokenUser.value;
        renderAt();

        expect(screen.getByText('Guest account')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
        expect(startSocialLogin).toHaveBeenCalledWith('google');
    });

    it('gives a guest who can sign in one card, signing in first and the invite last', () => {
        tokenUser.value = { name: 'Guest', userRole: 'guest' } as typeof tokenUser.value;
        renderAt();

        expect(screen.getAllByText('Guest account')).toHaveLength(1);
        const buttons = screen.getAllByRole('button').map(button => button.textContent ?? '');
        const google = buttons.findIndex(text => text.includes('Continue with Google'));
        const join = buttons.findIndex(text => text.includes('Join with invite'));
        expect(google).toBeGreaterThanOrEqual(0);
        expect(join).toBeGreaterThan(google);
    });

    it('opens the cloud list from its entry', () => {
        tokenUser.value = { name: 'Ada' };
        renderAt();

        fireEvent.click(screen.getByRole('button', { name: /My clouds/ }));

        expect(screen.getByTestId('away')).toBeTruthy();
    });

    it('opens device management from its entry', () => {
        tokenUser.value = { name: 'Ada' };
        renderAt();

        fireEvent.click(screen.getByRole('button', { name: /^Devices/ }));

        expect(screen.getByTestId('away')).toBeTruthy();
    });

    it('offers no device management to a guest', () => {
        tokenUser.value = { name: 'Guest', userRole: 'guest' };
        renderAt();

        expect(screen.queryByRole('button', { name: /^Devices/ })).toBeNull();
    });

    it('offers no device management while device pairing is off', () => {
        tokenUser.value = { name: 'Ada' };
        pairingEnabled.value = false;
        renderAt();

        expect(screen.queryByRole('button', { name: /^Devices/ })).toBeNull();
    });

    // Settings → Account → back used to land in chat: the hub names its parent
    // and returns to it.
    it('goes back to Settings, naming it, instead of landing in chat', () => {
        tokenUser.value = { name: 'Ada' };
        renderAt();

        fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

        expect(screen.getByTestId('settings')).toBeTruthy();
    });

    // The hub linked into Settings and back again with no new information: the
    // card is gone, and Settings is reached from the account menu instead.
    it('shows no notifications card back into Settings', () => {
        tokenUser.value = { name: 'Ada' };
        renderAt();

        expect(screen.queryByText('Notifications')).toBeNull();
    });

    it('saves a new name through the relay gateway', async () => {
        tokenUser.value = { name: 'Ada' };
        renderAt();

        fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
        fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada II' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(gatewayUpdate).toHaveBeenCalledWith({ name: 'Ada II' });
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Profile saved.' }));
    });

    it('announces a save the server refuses', async () => {
        tokenUser.value = { name: 'Ada' };
        gatewayUpdate.mockRejectedValueOnce(new Error('denied'));
        renderAt();

        fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
        fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada II' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await screen.findByRole('alert');
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
});
