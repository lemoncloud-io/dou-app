import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SharedModule from '../../../shared';

const env = vi.hoisted(() => ({
    canApprove: true,
    relayUser: { userRole: 'user' } as { userRole?: string } | null,
    selectedCloudId: 'default',
    clouds: [] as Array<{ id?: string; name?: string }>,
    classification: 'unknown' as string,
    checkPairing: vi.fn(),
    approvePairing: vi.fn(),
    denyPairing: vi.fn(),
    toast: vi.fn(),
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: { RELAY_SLOT: 'relay', useSlotVerified: () => true },
        session: {
            useSessionAuth: () => ({ isAuthenticated: true }),
            useIsPairedSession: () => false,
            useSessionSelection: () => ({ selectedCloudId: env.selectedCloudId, selectedSiteId: null }),
            getRelaySessionUser: () => env.relayUser,
            classifyPairingError: () => env.classification,
        },
        data: {
            useRuntimeRepositories: () => ({
                pairing: {
                    checkPairing: env.checkPairing,
                    approvePairing: env.approvePairing,
                    denyPairing: env.denyPairing,
                },
            }),
        },
    },
}));
vi.mock('../utils/devicePairing', () => ({ canApprovePairing: () => env.canApprove }));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useCloudSessionCatalog: () => ({ clouds: env.clouds, isPendingClouds: false }),
}));
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast: env.toast,
}));

import '../../../../i18n';
import { PairingApprovePage } from './PairingApprovePage';

const NOW = 1_000_000_000;

const check = (overrides: Record<string, unknown> = {}) => ({
    pairingId: 'p-1',
    purpose: 'web',
    deviceId: 'd-1',
    client: { name: 'Chrome · macOS', platform: 'macos' },
    expiredAt: NOW + 125_000,
    ...overrides,
});

const renderPage = (from?: string) =>
    render(
        <MemoryRouter initialEntries={[{ pathname: '/settings/pairing/approve', state: from ? { from } : null }]}>
            <Routes>
                <Route path="/settings/pairing/approve" element={<PairingApprovePage />} />
                <Route path="/settings" element={<p>settings page</p>} />
                <Route path="/account/devices" element={<p>devices page</p>} />
            </Routes>
        </MemoryRouter>
    );

const field = () => screen.getByLabelText('Code shown in the browser') as HTMLInputElement;

const enterCode = async (value: string) => {
    await act(async () => {
        fireEvent.change(field(), { target: { value } });
    });
};

describe('PairingApprovePage', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        vi.clearAllMocks();
        env.canApprove = true;
        env.relayUser = { userRole: 'user' };
        env.selectedCloudId = 'default';
        env.clouds = [];
        env.classification = 'unknown';
        env.checkPairing.mockResolvedValue(check());
        env.approvePairing.mockResolvedValue({ pairingId: 'p-1', status: 'approved' });
        env.denyPairing.mockResolvedValue({ pairingId: 'p-1', status: 'denied' });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('sends a browser or a paired session back where it came from', () => {
        env.canApprove = false;
        renderPage();

        expect(screen.getByText('settings page')).toBeTruthy();
    });

    describe('code input', () => {
        it('keeps the digits of a pasted code and looks it up once it has eight', async () => {
            renderPage();

            await enterCode('0734-4168');

            expect(env.checkPairing).toHaveBeenCalledTimes(1);
            expect(env.checkPairing).toHaveBeenCalledWith('07344168');
        });

        it('does not look up a partial code, and drops what is not a digit', async () => {
            renderPage();

            await enterCode(' 0734 41a');

            expect(field().value).toBe('073441');
            expect(env.checkPairing).not.toHaveBeenCalled();
        });

        it('looks up the same code only once, showing the first answer when it is typed back', async () => {
            renderPage();
            await enterCode('07344168');
            expect(await screen.findByTestId('pairing-client')).toBeTruthy();

            fireEvent.click(screen.getByRole('button', { name: 'Enter another code' }));
            await enterCode('07344168');

            expect(env.checkPairing).toHaveBeenCalledTimes(1);
            expect(screen.getByTestId('pairing-client').textContent).toBe('Chrome · macOS');
        });

        it('looks a code up again after a failure the relay gave no reason for', async () => {
            env.checkPairing.mockRejectedValueOnce(new Error('network'));
            renderPage();
            await enterCode('07344168');
            await screen.findByRole('alert');

            await enterCode('0734416');
            await enterCode('07344168');

            expect(env.checkPairing).toHaveBeenCalledTimes(2);
        });

        it.each([
            ['notFound', "Couldn't find that code. Check the code in the browser again."],
            ['expired', 'This code has expired. Get a new code in the browser.'],
            ['codeRefused', "This code can't be approved."],
            ['alreadyHandled', 'This request was already handled. Ask again in the browser.'],
            ['unknown', "Couldn't finish that. Check your connection and try again."],
        ])('says why a lookup failed: %s', async (classification, message) => {
            env.classification = classification;
            env.checkPairing.mockRejectedValueOnce(new Error('refused'));
            renderPage();

            await enterCode('07344168');

            expect((await screen.findByRole('alert')).textContent).toBe(message);
        });
    });

    describe('confirm step', () => {
        it('names the browser and asks to approve only the browser the person opened', async () => {
            renderPage();
            await enterCode('07344168');

            expect((await screen.findByTestId('pairing-client')).textContent).toBe('Chrome · macOS');
            expect(screen.getByText('Browser asking to sign in')).toBeTruthy();
            expect(screen.getByTestId('pairing-remaining').textContent).toBe('Code expires in 2:05');
            expect(screen.getByText('Approve only if this is the browser you just opened.')).toBeTruthy();
        });

        it('calls a nameless client an unknown browser, and a phone a phone', async () => {
            env.checkPairing.mockResolvedValue(check({ client: { platform: 'ios' } }));
            renderPage();
            await enterCode('07344168');

            expect((await screen.findByTestId('pairing-client')).textContent).toBe('Unknown browser');
            expect(screen.getByText('Phone asking to sign in')).toBeTruthy();
        });

        it('holds a developer-tool approval until the person confirms they started it', async () => {
            env.checkPairing.mockResolvedValue(check({ purpose: 'debug' }));
            renderPage();
            await enterCode('07344168');

            await screen.findByText('This issues a developer token with every permission on this account.');
            const approve = screen.getByRole('button', { name: 'Approve my whole account' }) as HTMLButtonElement;
            expect(approve.disabled).toBe(true);

            fireEvent.click(screen.getByLabelText('I started this developer tool myself.'));

            expect(approve.disabled).toBe(false);
        });

        it('asks for no confirmation on an ordinary web request', async () => {
            renderPage();
            await enterCode('07344168');

            const approve = (await screen.findByRole('button', {
                name: 'Approve my whole account',
            })) as HTMLButtonElement;
            expect(approve.disabled).toBe(false);
            expect(screen.queryByLabelText('I started this developer tool myself.')).toBeNull();
        });
    });

    describe('targets', () => {
        it('offers the whole account and each cloud, starting on the active cloud', async () => {
            env.clouds = [
                { id: 'c1', name: 'Team' },
                { id: 'c2', name: 'Lab' },
            ];
            env.selectedCloudId = 'c2';
            renderPage();
            await enterCode('07344168');
            await screen.findByTestId('pairing-client');

            const radios = screen.getAllByRole('radio') as HTMLInputElement[];
            expect(radios.map(radio => radio.value)).toEqual(['relay', 'c1', 'c2']);
            expect(radios.find(radio => radio.checked)?.value).toBe('c2');
            expect(screen.getByRole('button', { name: 'Approve Lab only' })).toBeTruthy();

            fireEvent.click(screen.getByLabelText(/My whole account/));
            expect(screen.getByRole('button', { name: 'Approve my whole account' })).toBeTruthy();
        });

        it('starts on the whole account on the relay', async () => {
            env.clouds = [{ id: 'c1', name: 'Team' }];
            renderPage();
            await enterCode('07344168');
            await screen.findByTestId('pairing-client');

            expect((screen.getAllByRole('radio') as HTMLInputElement[]).find(radio => radio.checked)?.value).toBe(
                'relay'
            );
        });

        it('leaves the whole account out for a guest', async () => {
            env.relayUser = { userRole: 'guest' };
            env.clouds = [{ id: 'c1', name: 'Team' }];
            renderPage();
            await enterCode('07344168');
            await screen.findByTestId('pairing-client');

            expect((screen.getAllByRole('radio') as HTMLInputElement[]).map(radio => radio.value)).toEqual(['c1']);
        });

        it('says there is nothing to approve with, and offers no approval, when there is no option', async () => {
            env.relayUser = { userRole: 'guest' };
            renderPage();
            await enterCode('07344168');
            await screen.findByTestId('pairing-client');

            expect(screen.getByText('There is no account you can approve with.')).toBeTruthy();
            expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
            expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
        });
    });

    describe('decisions', () => {
        it('approves the chosen cloud, says the browser will finish, and goes back', async () => {
            env.clouds = [{ id: 'c1', name: 'Team' }];
            env.selectedCloudId = 'c1';
            renderPage('/account/devices');
            await enterCode('07344168');

            await act(async () => {
                fireEvent.click(await screen.findByRole('button', { name: 'Approve Team only' }));
            });

            expect(env.approvePairing).toHaveBeenCalledWith('p-1', { type: 'cloud', cloudId: 'c1' });
            expect(env.toast).toHaveBeenCalledWith({ title: 'The browser will finish signing in.' });
            expect(screen.getByText('devices page')).toBeTruthy();
        });

        it('declines, says so, and goes back', async () => {
            renderPage();
            await enterCode('07344168');

            await act(async () => {
                fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
            });

            expect(env.denyPairing).toHaveBeenCalledWith('p-1');
            expect(env.toast).toHaveBeenCalledWith({ title: 'Declined.' });
            expect(screen.getByText('settings page')).toBeTruthy();
        });

        it('stays on the request and says why when the approval is refused', async () => {
            env.classification = 'targetRefused';
            env.approvePairing.mockRejectedValueOnce(new Error('403'));
            renderPage();
            await enterCode('07344168');

            await act(async () => {
                fireEvent.click(await screen.findByRole('button', { name: 'Approve my whole account' }));
            });

            expect(screen.getByRole('alert').textContent).toBe("Can't approve for this choice.");
            expect(screen.getByTestId('pairing-client')).toBeTruthy();
            expect(env.toast).not.toHaveBeenCalled();
        });
    });
});
