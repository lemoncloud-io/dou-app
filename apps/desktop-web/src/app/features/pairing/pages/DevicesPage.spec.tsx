import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SharedModule from '../../../shared';

const env = vi.hoisted(() => ({
    enabled: true,
    canApprove: true,
    relayUser: { userRole: 'user' } as { userRole?: string } | null,
    selectedCloudId: 'default',
    clouds: [] as Array<{ id?: string; name?: string }>,
    listDevices: vi.fn(),
    unlinkDevice: vi.fn(),
    listPairings: vi.fn(),
    revokePairing: vi.fn(),
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: { RELAY_SLOT: 'relay', useSlotVerified: () => true },
        session: {
            useSessionAuth: () => ({ isAuthenticated: true }),
            useIsPairedSession: () => false,
            useSessionSelection: () => ({ selectedCloudId: env.selectedCloudId, selectedSiteId: null }),
            getRelaySessionUser: () => env.relayUser,
        },
        data: {
            useRuntimeRepositories: () => ({
                user: { listDevices: env.listDevices, unlinkDevice: env.unlinkDevice },
                pairing: { listPairings: env.listPairings, revokePairing: env.revokePairing },
            }),
        },
    },
}));
vi.mock('../utils/devicePairing', () => ({
    isDevicePairingEnabled: () => env.enabled,
    canApprovePairing: () => env.canApprove,
}));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useCloudSessionCatalog: () => ({ clouds: env.clouds, isPendingClouds: false }),
}));

import '../../../../i18n';
import { DevicesPage } from './DevicesPage';

const device = (overrides: Record<string, unknown>) => ({
    id: 'd',
    name: 'Device',
    kind: 'desktop',
    presence: 'red',
    current: false,
    ...overrides,
});

const pairing = (overrides: Record<string, unknown>) => ({
    pairingId: 'p',
    purpose: 'web',
    client: { name: 'Chrome · macOS' },
    target: { type: 'relay' },
    status: 'approved',
    approvedAt: Date.now(),
    ...overrides,
});

const renderPage = () =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={['/account/devices']}>
                <Routes>
                    <Route path="/account/devices" element={<DevicesPage />} />
                    <Route path="/account" element={<p>account page</p>} />
                    <Route path="/settings/pairing/approve" element={<p>approve page</p>} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );

const confirmIn = async (dialogText: string) => {
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain(dialogText);
    await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    });
};

describe('DevicesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        env.enabled = true;
        env.canApprove = true;
        env.relayUser = { userRole: 'user' };
        env.selectedCloudId = 'default';
        env.clouds = [];
        env.listDevices.mockResolvedValue({ list: [], at: 0 });
        env.unlinkDevice.mockResolvedValue({ id: 'd', marked: true, closed: true });
        env.listPairings.mockResolvedValue({ list: [] });
        env.revokePairing.mockResolvedValue({ pairingId: 'p', status: 'revoked' });
    });

    afterEach(cleanup);

    it.each([
        ['a guest', () => (env.relayUser = { userRole: 'guest' })],
        ['the flag is off', () => (env.enabled = false)],
    ])('sends %s back to the account hub', (_label, arrange) => {
        arrange();
        renderPage();

        expect(screen.getByText('account page')).toBeTruthy();
        expect(env.listDevices).not.toHaveBeenCalled();
    });

    describe('devices', () => {
        it('marks this device and never offers to unlink it', async () => {
            env.listDevices.mockResolvedValue({
                list: [
                    device({ id: 'me', name: 'This Mac', current: true, presence: 'green' }),
                    device({ id: 'other', name: 'Old PC' }),
                ],
                at: 0,
            });
            renderPage();

            const rows = await screen.findAllByTestId('device-row');
            expect(rows[0].textContent).toContain('This device');
            expect(rows[0].textContent).toContain('Desktop · Online');
            expect(within(rows[0]).queryByRole('button', { name: /Unlink/ })).toBeNull();
            expect(within(rows[1]).getByRole('button', { name: 'Unlink Old PC' })).toBeTruthy();
        });

        it('names a device without a name or a known kind as unknown', async () => {
            env.listDevices.mockResolvedValue({ list: [device({ id: 'x', name: undefined, kind: '' })], at: 0 });
            renderPage();

            const [row] = await screen.findAllByTestId('device-row');
            expect(row.textContent).toContain('Unknown device');
            expect(row.textContent).toContain('Unknown device · Offline');
        });

        it('shows when an offline device was last active', async () => {
            env.listDevices.mockResolvedValue({
                list: [device({ id: 'x', kind: 'web', lastActiveAt: Date.now() })],
                at: 0,
            });
            renderPage();

            const [row] = await screen.findAllByTestId('device-row');
            expect(row.textContent).toMatch(/Browser · Last active \S/);
        });

        it('heads the list as the cloud’s devices inside a cloud', async () => {
            env.selectedCloudId = 'c1';
            renderPage();

            expect(await screen.findByText('Devices in this cloud')).toBeTruthy();
        });

        it('unlinks a device after a confirmation and reads the list again', async () => {
            env.listDevices.mockResolvedValue({ list: [device({ id: 'other', name: 'Old PC' })], at: 0 });
            renderPage();

            fireEvent.click(await screen.findByRole('button', { name: 'Unlink Old PC' }));
            await confirmIn('This device will be signed out.');

            expect(env.unlinkDevice).toHaveBeenCalledWith('other');
            expect(env.listDevices).toHaveBeenCalledTimes(2);
        });

        it('tells a cloud’s device unlink that a web sign-in also needs its approval unlinked', async () => {
            env.selectedCloudId = 'c1';
            env.listDevices.mockResolvedValue({ list: [device({ id: 'other', name: 'Old PC' })], at: 0 });
            renderPage();

            fireEvent.click(await screen.findByRole('button', { name: 'Unlink Old PC' }));

            expect((await screen.findByRole('alertdialog')).textContent).toContain(
                'To end a web sign-in, also unlink it under Approved sign-ins.'
            );
        });

        it('shows a failed list with a retry instead of breaking', async () => {
            env.listDevices.mockRejectedValueOnce(new Error('UnknownError'));
            renderPage();

            const alert = await screen.findByRole('alert');
            expect(alert.textContent).toContain("Couldn't load the devices.");
            await act(async () => {
                fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
            });
            expect(env.listDevices).toHaveBeenCalledTimes(2);
        });
    });

    describe('approved sign-ins', () => {
        it('is not shown where this device cannot approve', async () => {
            env.canApprove = false;
            renderPage();
            await screen.findByText('No devices.');

            expect(screen.queryByText('Approved sign-ins')).toBeNull();
            expect(env.listPairings).not.toHaveBeenCalled();
        });

        it('lists only approvals still in force, with their scope', async () => {
            env.clouds = [{ id: 'c1', name: 'Team' }];
            env.listPairings.mockResolvedValue({
                list: [
                    pairing({ pairingId: 'a', client: { name: 'Relay tab' }, claimedAt: Date.now() }),
                    pairing({ pairingId: 'b', client: { name: 'Team tab' }, target: { type: 'cloud', cloudId: 'c1' } }),
                    pairing({ pairingId: 'c', client: { name: 'Gone tab' }, target: { type: 'cloud', cloudId: 'c9' } }),
                    pairing({ pairingId: 'd', client: { name: 'Revoked tab' }, status: 'revoked' }),
                    pairing({ pairingId: 'e', client: {}, purpose: 'debug', claimedAt: Date.now() }),
                ],
            });
            renderPage();

            const rows = await screen.findAllByTestId('pairing-row');
            expect(rows).toHaveLength(4);
            expect(rows[0].textContent).toContain('My whole account');
            expect(rows[1].textContent).toContain('Team only');
            expect(rows[2].textContent).toContain('c9 only');
            expect(screen.queryByText('Revoked tab')).toBeNull();
            expect(rows[3].textContent).toContain('Unknown browser');
            expect(rows[3].textContent).toContain('Developer tool');
        });

        it('warns about an unclaimed relay approval, never about a cloud one', async () => {
            env.listPairings.mockResolvedValue({
                list: [
                    pairing({ pairingId: 'a', client: { name: 'Unclaimed relay' } }),
                    pairing({ pairingId: 'b', client: { name: 'Claimed relay' }, claimedAt: Date.now() }),
                    pairing({ pairingId: 'c', client: { name: 'Cloud' }, target: { type: 'cloud', cloudId: 'c1' } }),
                ],
            });
            renderPage();

            const rows = await screen.findAllByTestId('pairing-row');
            const warning = 'Not signed in · unlinking recommended';
            expect(rows[0].textContent).toContain(warning);
            expect(rows[1].textContent).not.toContain(warning);
            expect(rows[2].textContent).not.toContain(warning);
        });

        it.each([
            [{ type: 'relay' }, "This browser's sign-in ends right away."],
            [{ type: 'cloud', cloudId: 'c1' }, 'A screen that is already open can stay for up to 30 days'],
        ])('confirms withdrawing a %j approval with what it does, then reads the list again', async (target, text) => {
            env.listPairings.mockResolvedValue({
                list: [pairing({ pairingId: 'p-9', client: { name: 'Tab' }, target })],
            });
            renderPage();

            fireEvent.click(await screen.findByRole('button', { name: 'Unlink Tab' }));
            await confirmIn(text);

            expect(env.revokePairing).toHaveBeenCalledWith('p-9');
            expect(env.listPairings).toHaveBeenCalledTimes(2);
        });

        it('links to the approval screen, coming back here', async () => {
            renderPage();

            fireEvent.click(await screen.findByRole('button', { name: 'Approve web sign-in' }));

            expect(screen.getByText('approve page')).toBeTruthy();
        });
    });
});
