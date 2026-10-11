import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type * as ChaticSharedModule from '@chatic/shared';

const tokenUser = vi.hoisted(() => ({ value: null as { name?: string; photo?: string } | null }));
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

import '../../../../i18n';

import { AccountHubPage } from './AccountHubPage';

const renderAt = () =>
    render(
        <MemoryRouter initialEntries={['/account']}>
            <Routes>
                <Route path="/account" element={<AccountHubPage />} />
                <Route path="*" element={<div data-testid="away" />} />
            </Routes>
        </MemoryRouter>
    );

describe('AccountHubPage', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        tokenUser.value = null;
        gatewayUpdate.mockImplementation(async (data: unknown) => data);
        prepareImage.mockResolvedValue({ avatar: 'data:image/jpeg;base64,NEW' });
    });

    it('shows the relay account with its photo', () => {
        tokenUser.value = { name: 'Ada', photo: 'data:image/jpeg;base64,OLD' };
        renderAt();

        expect(screen.getByText('Ada')).toBeTruthy();
    });

    it('invites a guest to join instead of showing an empty card', () => {
        renderAt();

        expect(screen.getByText('Guest account')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });

    it('opens the cloud list from its entry', () => {
        tokenUser.value = { name: 'Ada' };
        renderAt();

        fireEvent.click(screen.getByRole('button', { name: 'Open' }));

        expect(screen.getByTestId('away')).toBeTruthy();
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
