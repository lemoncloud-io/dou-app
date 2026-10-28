import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import i18n from '../../../../i18n';
import { createPortSetup } from '../lib/createPortSetup';
import { createMockPort } from '../lib/mock';
import { memoryStateStore } from '../lib/mock/storage';

import { MANAGEMENT_SCREENS_OPEN } from '../lib/screens';

import { SubscriptionRoutes } from './index';

import type { PortSetup } from '../lib/createPortSetup';

// The screens are not under test here — only which one a URL reaches, which shell holds it and where
// the guards send the reader. Each screen stands in as its id, so filling a screen never breaks this
// file; the shells, guards and developer pages stay real.
vi.mock('../pages/entry', () => ({
    PlansPage: () => <p>W-01</p>,
    LoginPage: () => <p>W-02</p>,
    LoginCallbackPage: () => <p>W-02 callback</p>,
    NoLinkedAccountPage: () => <p>W-02b</p>,
    StoreManagedPage: () => <p>W-17</p>,
}));
vi.mock('../pages/checkout', () => ({
    CheckoutEmailPage: () => <p>W-24</p>,
    CheckoutPage: () => <p>W-08</p>,
    CheckoutPaymentPage: () => <p>W-05</p>,
    CheckoutStatusPage: () => <p>W-09</p>,
    CheckoutCompletePage: () => <p>W-06</p>,
    ChangePlanPage: () => <p>W-14</p>,
}));
vi.mock('../pages/manage', () => ({
    SubscriptionListPage: () => <p>W-10</p>,
    SubscriptionDetailPage: () => <p>W-18</p>,
    CancelSubscriptionPage: () => <p>W-15</p>,
}));
vi.mock('../pages/billing', () => ({
    PaymentMethodsPage: () => <p>W-12</p>,
    BillingHistoryPage: () => <p>W-13</p>,
    BillingInfoPage: () => <p>W-16</p>,
}));

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

// `management` opens the card and billing-email screens, which are hidden by default (`lib/screens.tsx`).
const renderAt = (url: string, setup: PortSetup, { management = true }: { management?: boolean } = {}) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <Routes>
                <Route path="/subscription/*" element={<SubscriptionRoutes setup={setup} management={management} />} />
            </Routes>
            <Where />
        </MemoryRouter>
    );

const where = () => screen.getByTestId('where').textContent;

// The account shell's sidebar, so a plan name there is not confused with the same name on a screen.
const sidebar = async () => within(await screen.findByRole('complementary'));

describe('SubscriptionRoutes', () => {
    it('sends a reader with no session to sign in, and back afterwards', async () => {
        renderAt('/subscription/history', mockSetup('?mock=visitor'));

        expect(await screen.findByText('W-02')).toBeTruthy();
        expect(where()).toBe('/subscription/login?next=%2Fsubscription%2Fhistory');
    });

    it('opens the public pages without a session', async () => {
        renderAt('/subscription/plans', mockSetup('?mock=visitor'));

        expect(await screen.findByText('W-01')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    });

    it('opens a management page in the account shell for a signed-in reader', async () => {
        renderAt('/subscription', mockSetup('?mock=active'));

        expect(await screen.findByText('W-10')).toBeTruthy();
        expect(await (await sidebar()).findByText('DoU Cloud 2')).toBeTruthy();
        expect((await sidebar()).getByText('Web subscription · Next payment 2026.11.20')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Cancel subscription' }).getAttribute('href')).toBe(
            '/subscription/sub-2/cancel'
        );
    });

    it('offers cancelling in the sidebar only where the detail screen would', async () => {
        renderAt('/subscription', mockSetup('?mock=downgrade-scheduled'));

        expect(await (await sidebar()).findByText('DoU Cloud 3')).toBeTruthy();
        expect(screen.queryByRole('link', { name: 'Cancel subscription' })).toBeNull();
    });

    it('opens the email step for a signed-in reader', async () => {
        renderAt('/subscription/checkout/email?plan=pro-tier-01', mockSetup('?mock=new'));

        expect(await screen.findByText('W-24')).toBeTruthy();
    });

    describe('with the card and billing-email screens hidden (the default)', () => {
        it.each([
            ['/subscription/payment-methods'],
            ['/subscription/billing-info'],
            ['/subscription/checkout/email?plan=pro-tier-01'],
        ])('does not register %s: it falls to the subscription list', async url => {
            renderAt(url, mockSetup('?mock=active'), { management: false });

            expect(await screen.findByText('W-10')).toBeTruthy();
            expect(where()).toBe('/subscription');
        });

        it('leaves the card and billing-email screens out of the sidebar, and keeps the rest', async () => {
            renderAt('/subscription', mockSetup('?mock=active'), { management: false });

            const nav = within(await screen.findByRole('navigation'));
            expect(nav.getByRole('link', { name: 'Subscription' })).toBeTruthy();
            expect(nav.getByRole('link', { name: 'Billing history' })).toBeTruthy();
            expect(nav.queryByRole('link', { name: 'Payment methods' })).toBeNull();
            expect(nav.queryByRole('link', { name: 'Billing info' })).toBeNull();
        });

        it('keeps the screens that stay open', async () => {
            renderAt('/subscription/history', mockSetup('?mock=active'), { management: false });

            expect(await screen.findByText('W-13')).toBeTruthy();
            expect(where()).toBe('/subscription/history');
        });

        it('is hidden unless asked for: nothing opens them by default', () => {
            expect(MANAGEMENT_SCREENS_OPEN).toBe(false);
        });
    });

    it('sends a store subscriber to the store notice instead of checkout', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=store-ios'));

        expect(await screen.findByText('W-17')).toBeTruthy();
        expect(where()).toBe('/subscription/store-managed');
    });

    it('takes a signed-in reader past the sign-in page to a safe next', async () => {
        renderAt('/subscription/login?next=%2Fsubscription%2Fhistory', mockSetup('?mock=active'));

        expect(await screen.findByText('W-13')).toBeTruthy();
        expect(where()).toBe('/subscription/history');
    });

    it('ignores an unsafe next on the sign-in page', async () => {
        renderAt('/subscription/login?next=https%3A%2F%2Fevil.example', mockSetup('?mock=active'));

        expect(await screen.findByText('W-01')).toBeTruthy();
        expect(where()).toBe('/subscription/plans');
    });

    it('sends the reader to sign in when the session ends mid-page, keeping the way back', async () => {
        renderAt('/subscription/history', mockSetup('?mock=active&fail=session-ended'));

        await waitFor(() =>
            expect(where()).toBe('/subscription/login?reason=session-ended&next=%2Fsubscription%2Fhistory')
        );
        expect(await screen.findByText('W-02')).toBeTruthy();
    });

    it('shows the desktop-only notice on a phone-width screen', async () => {
        narrow = true;
        renderAt('/subscription/plans', mockSetup('?mock=visitor'));

        expect(await screen.findByText('On a phone, subscribe in the app')).toBeTruthy();
        expect(screen.queryByText('W-01')).toBeNull();
    });

    it('drops the desktop card from the phone notice where nothing can be bought on the web yet', async () => {
        narrow = true;
        render(
            <MemoryRouter initialEntries={['/subscription/plans']}>
                <Routes>
                    <Route
                        path="/subscription/plans/*"
                        element={<SubscriptionRoutes account={false} setup={createPortSetup({ account: false })} />}
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText('On a phone, subscribe in the app')).toBeTruthy();
        expect(screen.queryByText('Subscribe on the web from a computer')).toBeNull();
    });

    it('sends an unknown deeper path to the subscription list', async () => {
        renderAt('/subscription/a/b/c', mockSetup('?mock=active'));

        expect(await screen.findByText('W-10')).toBeTruthy();
        expect(where()).toBe('/subscription');
    });

    it("returns from the stand-in consent page to the callback with the reader's choice", async () => {
        renderAt('/subscription/login/mock-provider?provider=google&nonce=n-1', mockSetup('?mock=no-linked-account'));

        // The scenario preselects the no-linked-account answer.
        expect(((await screen.findByLabelText('No DoU account linked')) as HTMLInputElement).checked).toBe(true);
        fireEvent.click(screen.getByLabelText('Cancel'));
        fireEvent.click(screen.getByRole('button', { name: 'Return to DoU' }));

        expect(await screen.findByText('W-02 callback')).toBeTruthy();
        expect(where()).toBe('/subscription/login/callback?provider=google&nonce=n-1&result=canceled');
    });

    it('lets the stand-in payment window answer a card registration', async () => {
        const setup = mockSetup('?mock=active&fail=card-declined');
        renderAt('/subscription/payment-methods', setup);
        await screen.findByText('W-12');

        let outcome: Promise<{ outcome: string }> = Promise.resolve({ outcome: '' });
        act(() => {
            outcome = setup.port.startPaymentMethodRegistration({
                purpose: 'addCard',
                payer: { name: '김민지', phone: '01012345678', email: 'minji.kim@gmail.com' },
            });
        });
        const registered = await screen.findByRole('button', { name: 'Registered' });
        // The declined card is what the fail flag implies, so that answer is the one marked.
        expect(screen.getByRole('button', { name: 'Registration failed' }).hasAttribute('data-suggested')).toBe(true);
        fireEvent.click(registered);

        expect(await outcome).toMatchObject({ outcome: 'registered' });
        expect(await setup.port.listPaymentMethods()).toHaveLength(3);
    });

    it('switches the scenario from the dev panel and refetches what the screen shows', async () => {
        renderAt('/subscription', mockSetup('?mock=active', { panel: true }));
        expect(await (await sidebar()).findByText('DoU Cloud 2')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'mock: active' }));
        fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: 'downgrade-scheduled' } });

        expect(await (await sidebar()).findByText('DoU Cloud 3')).toBeTruthy();
    });

    it('signs out from the account menu and lands on the plans', async () => {
        const setup = mockSetup('?mock=active');
        renderAt('/subscription/history', setup);
        await screen.findByText('W-13');

        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

        expect(await screen.findByText('You have signed out')).toBeTruthy();
        expect(where()).toBe('/subscription/plans');
        expect(await setup.port.getSession()).toBeNull();
    });
});
