import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import i18n from '../../../../i18n';
import { createMockPort } from '../lib/mock';
import { memoryStateStore } from '../lib/mock/storage';

import { SubscriptionRoutes } from './index';

import type { PortSetup } from '../lib/createPortSetup';

// jsdom has no matchMedia; each test says whether the viewport is phone-width.
let narrow = false;
beforeAll(async () => {
    window.matchMedia = ((query: string) => ({
        matches: narrow,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    narrow = false;
});

// The dev panel re-renders on every mock commit, including the ones a test makes outside React; it
// stays hidden unless a test is about it.
const mockSetup = (search: string, { panel = false } = {}): PortSetup => {
    const { port, clock, controller } = createMockPort({
        store: memoryStateStore(),
        readSearch: () => (panel ? search : `${search}&panel=0`),
        delayMs: 0,
    });
    return { port, clock, mock: controller };
};

const Where = () => {
    const { pathname, search } = useLocation();
    return <output data-testid="where">{pathname + search}</output>;
};

const renderAt = (url: string, setup: PortSetup) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <Routes>
                <Route path="/subscription/*" element={<SubscriptionRoutes setup={setup} />} />
            </Routes>
            <Where />
        </MemoryRouter>
    );

const where = () => screen.getByTestId('where').textContent;

describe('SubscriptionRoutes', () => {
    it('sends a reader with no session to sign in, and back afterwards', async () => {
        renderAt('/subscription/history', mockSetup('?mock=visitor'));

        expect(await screen.findByText('The W-02 screen is on its way')).toBeTruthy();
        expect(where()).toBe('/subscription/login?next=%2Fsubscription%2Fhistory');
    });

    it('opens the public pages without a session', async () => {
        renderAt('/subscription/plans', mockSetup('?mock=visitor'));

        expect(await screen.findByText('The W-01 screen is on its way')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    });

    it('opens a management page in the account shell for a signed-in reader', async () => {
        renderAt('/subscription', mockSetup('?mock=active'));

        expect(await screen.findByText('The W-10 screen is on its way')).toBeTruthy();
        expect(await screen.findByText('DoU Cloud 2')).toBeTruthy();
        expect(screen.getByText('Web subscription · Next payment 2026.11.20')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Cancel subscription' }).getAttribute('href')).toBe(
            '/subscription/sub-2/cancel'
        );
    });

    it('sends a store subscriber to the store notice instead of checkout', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=store-ios'));

        expect(await screen.findByText('The W-17 screen is on its way')).toBeTruthy();
        expect(where()).toBe('/subscription/store-managed');
    });

    it('takes a signed-in reader past the sign-in page to a safe next', async () => {
        renderAt('/subscription/login?next=%2Fsubscription%2Fhistory', mockSetup('?mock=active'));

        expect(await screen.findByText('The W-13 screen is on its way')).toBeTruthy();
        expect(where()).toBe('/subscription/history');
    });

    it('ignores an unsafe next on the sign-in page', async () => {
        renderAt('/subscription/login?next=https%3A%2F%2Fevil.example', mockSetup('?mock=active'));

        expect(await screen.findByText('The W-10 screen is on its way')).toBeTruthy();
        expect(where()).toBe('/subscription');
    });

    it('sends the reader to sign in when the session ends mid-page, keeping the way back', async () => {
        renderAt('/subscription/history', mockSetup('?mock=active&fail=session-ended'));

        await waitFor(() =>
            expect(where()).toBe('/subscription/login?reason=session-ended&next=%2Fsubscription%2Fhistory')
        );
        expect(await screen.findByText('The W-02 screen is on its way')).toBeTruthy();
    });

    it('shows the desktop-only notice on a phone-width screen', async () => {
        narrow = true;
        renderAt('/subscription/plans', mockSetup('?mock=visitor'));

        expect(await screen.findByText('On a phone, subscribe in the app')).toBeTruthy();
        expect(screen.queryByText('The W-01 screen is on its way')).toBeNull();
    });

    it('sends an unknown deeper path to the subscription list', async () => {
        renderAt('/subscription/a/b/c', mockSetup('?mock=active'));

        expect(await screen.findByText('The W-10 screen is on its way')).toBeTruthy();
        expect(where()).toBe('/subscription');
    });

    it("returns from the stand-in consent page to the callback with the reader's choice", async () => {
        renderAt('/subscription/login/mock-provider?provider=google&nonce=n-1', mockSetup('?mock=no-linked-account'));

        // The scenario preselects the no-linked-account answer.
        expect(((await screen.findByLabelText('No DoU account linked')) as HTMLInputElement).checked).toBe(true);
        fireEvent.click(screen.getByLabelText('Cancel'));
        fireEvent.click(screen.getByRole('button', { name: 'Return to DoU' }));

        expect(await screen.findByText('The W-02 callback screen is on its way')).toBeTruthy();
        expect(where()).toBe('/subscription/login/callback?provider=google&nonce=n-1&result=canceled');
    });

    it('lets the stand-in payment window answer a card registration', async () => {
        const setup = mockSetup('?mock=active&fail=card-declined');
        renderAt('/subscription/payment-methods', setup);
        await screen.findByText('The W-12 screen is on its way');

        let outcome: Promise<{ outcome: string }> = Promise.resolve({ outcome: '' });
        act(() => {
            outcome = setup.port.startPaymentMethodRegistration({ purpose: 'addCard' });
        });
        const registered = await screen.findByRole('button', { name: 'Registered' });
        // The declined card is what the fail flag implies, so that answer is the one marked.
        expect(screen.getByRole('button', { name: 'Registration failed' }).hasAttribute('data-suggested')).toBe(true);
        fireEvent.click(registered);

        expect(await outcome).toEqual({ outcome: 'registered' });
        expect(await setup.port.listPaymentMethods()).toHaveLength(3);
    });

    it('switches the scenario from the dev panel and refetches what the screen shows', async () => {
        renderAt('/subscription', mockSetup('?mock=active', { panel: true }));
        expect(await screen.findByText('DoU Cloud 2')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'mock: active' }));
        fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: 'downgrade-scheduled' } });

        expect(await screen.findByText('DoU Cloud 3')).toBeTruthy();
    });

    it('signs out from the account menu and lands on the plans', async () => {
        const setup = mockSetup('?mock=active');
        renderAt('/subscription/history', setup);
        await screen.findByText('The W-13 screen is on its way');

        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

        expect(await screen.findByText('You have signed out')).toBeTruthy();
        expect(where()).toBe('/subscription/plans');
        expect(await setup.port.getSession()).toBeNull();
    });
});
