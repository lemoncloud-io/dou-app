import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import i18n from '../../../../../i18n';
import { createMockPort } from '../../lib/mock';
import { memoryStateStore } from '../../lib/mock/storage';
import { SubscriptionRoutes } from '../../routes';

import type { PortSetup } from '../../lib/createPortSetup';

// jsdom has no matchMedia; these are desktop screens.
beforeAll(async () => {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    await i18n.changeLanguage('en');
});

// Attempts settle on the next call, so a flow runs to its end without waiting out the mock's delay.
const mockSetup = (search: string): PortSetup => {
    const { port, clock, controller } = createMockPort({
        store: memoryStateStore(),
        readSearch: () => `${search}&panel=0`,
        delayMs: 0,
        settleMs: 0,
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

const verifyEmailAndConsent = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Send code' }));
    fireEvent.change(await screen.findByLabelText(/Enter the code we sent/), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await screen.findByText('✓ Verified');
    fireEvent.click(screen.getByLabelText('Agree to all'));
};

describe('W-08 checkout', () => {
    it('opens the way on only once the email is verified and every consent given', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=new'));

        expect(await screen.findByRole('heading', { name: 'Review your order' })).toBeTruthy();
        expect(screen.getByText('Google · minji.kim@gmail.com')).toBeTruthy();
        const next = screen.getByRole('button', { name: 'Next · Add a payment method' }) as HTMLButtonElement;
        expect(next.disabled).toBe(true);

        await verifyEmailAndConsent();
        expect(next.disabled).toBe(false);

        fireEvent.change(screen.getByLabelText('Billing country'), { target: { value: 'US' } });
        expect(screen.getByText('Paying from outside Korea is coming soon')).toBeTruthy();
        expect(next.disabled).toBe(true);

        fireEvent.change(screen.getByLabelText('Billing country'), { target: { value: 'KR' } });
        fireEvent.click(next);
        await waitFor(() => expect(where()).toBe('/subscription/checkout/payment?plan=pro-tier-01'));
    });

    it('rejects a wrong verification code', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=new'));

        fireEvent.click(await screen.findByRole('button', { name: 'Send code' }));
        fireEvent.change(await screen.findByLabelText(/Enter the code we sent/), { target: { value: '000000' } });
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

        expect(await screen.findByText('That code does not match. Please check it and try again.')).toBeTruthy();
    });

    it('shows a first payment without a trial', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=new-trial-used'));

        expect(await screen.findByText('None — already used')).toBeTruthy();
        expect(screen.getByText('2026.11.01 (today)')).toBeTruthy();
    });

    it('sends a subscriber to the plan change instead', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-03', mockSetup('?mock=active'));

        await waitFor(() => expect(where()).toBe('/subscription/change?plan=pro-tier-03'));
    });
});

const toPayment = async () => {
    await verifyEmailAndConsent();
    fireEvent.click(screen.getByRole('button', { name: 'Next · Add a payment method' }));
    await screen.findByRole('heading', { name: 'Add a payment method' });
};

describe('W-05 card, W-09 and W-06', () => {
    it('goes back to W-08 when reached without its details', async () => {
        renderAt('/subscription/checkout/payment?plan=pro-tier-01', mockSetup('?mock=new'));

        await waitFor(() => expect(where()).toBe('/subscription/checkout?plan=pro-tier-01'));
    });

    it('registers a card, starts the trial and lands on W-06', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=new'));
        await toPayment();

        fireEvent.click(screen.getByRole('button', { name: 'Add card and start free trial' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Registered' }));

        expect(await screen.findByText('Your DoU Cloud 1 free trial has started')).toBeTruthy();
        expect(where()).toMatch(/^\/subscription\/checkout\/complete\?attempt=att-\d+&plan=pro-tier-01$/);
        expect(screen.getByText('Until 2026.11.07')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Set up clouds in the app' })).toBeTruthy();
    });

    it('charges a first payment without a trial', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=new-trial-used'));
        await toPayment();

        fireEvent.click(screen.getByRole('button', { name: 'Pay ₩8,600' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Registered' }));

        expect(await screen.findByText('You have subscribed to DoU Cloud 1')).toBeTruthy();
        expect(screen.getByText('2026.12.01')).toBeTruthy();
    });

    it('shows a declined card with the way back to the payment window', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=new&fail=card-declined'));
        await toPayment();

        fireEvent.click(screen.getByRole('button', { name: 'Add card and start free trial' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Registered' }));

        expect(await screen.findByText('We could not add your card')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe(
            '/subscription/checkout/payment?plan=pro-tier-01'
        );
    });

    it('shows a closed payment window without starting anything', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=new-trial-used'));
        await toPayment();

        fireEvent.click(screen.getByRole('button', { name: 'Pay ₩8,600' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Close the window' }));

        expect(await screen.findByText('Payment canceled')).toBeTruthy();
        expect(where()).toBe('/subscription/checkout/status?plan=pro-tier-01&outcome=closed');
        // The retry carries W-08's details along, so W-05 opens instead of sending the reader back.
        fireEvent.click(screen.getByRole('link', { name: 'Pay again' }));
        expect(await screen.findByRole('heading', { name: 'Add a payment method' })).toBeTruthy();
    });

    it('sends a subscriber who comes back to W-05 on to the plan change, without opening the window', async () => {
        renderAt('/subscription/checkout/payment?plan=pro-tier-01', mockSetup('?mock=active'));

        await waitFor(() => expect(where()).toBe('/subscription/change?plan=pro-tier-01'));
    });

    it('sends an unknown attempt to the subscription list', async () => {
        renderAt('/subscription/checkout/status?attempt=att-999', mockSetup('?mock=active'));

        await waitFor(() => expect(where()).toBe('/subscription'));
    });
});

describe('W-14 plan change', () => {
    it('charges an upgrade and lands on W-06', async () => {
        renderAt('/subscription/change?plan=pro-tier-03', mockSetup('?mock=active'));

        expect(await screen.findByRole('heading', { name: 'Confirm upgrade' })).toBeTruthy();
        expect(screen.getByText('2026.11.20 (unchanged)')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^Pay ₩[\d,]+ and upgrade$/ }));

        expect(await screen.findByText('You have upgraded to DoU Cloud 3')).toBeTruthy();
        expect(screen.getByText('₩25,800', { exact: false })).toBeTruthy();
    });

    it('shows a failed upgrade with the card it tried', async () => {
        renderAt('/subscription/change?plan=pro-tier-03', mockSetup('?mock=active&fail=card-declined'));

        fireEvent.click(await screen.findByRole('button', { name: /and upgrade$/ }));

        expect(await screen.findByText('Upgrade failed')).toBeTruthy();
        expect(screen.getByText('Card used: 신한 ···· 1234')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe(
            '/subscription/change?plan=pro-tier-03'
        );
    });

    it('cancels a scheduled downgrade by upgrading', async () => {
        renderAt('/subscription/change?plan=pro-tier-04', mockSetup('?mock=downgrade-scheduled'));

        expect(await screen.findByText('A change to DoU Cloud 2 is scheduled')).toBeTruthy();
        expect(screen.getByRole('button', { name: /^Cancel the change and pay/ })).toBeTruthy();
    });

    it('schedules a downgrade and lands on W-06', async () => {
        renderAt('/subscription/change?plan=pro-tier-01', mockSetup('?mock=active'));

        expect(await screen.findByRole('heading', { name: 'Schedule a downgrade' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Schedule the change' }));

        expect(await screen.findByText('Change to DoU Cloud 1 scheduled')).toBeTruthy();
        expect(where()).toBe('/subscription/checkout/complete?change=downgrade');
        expect(screen.getByText('You keep DoU Cloud 2 until 2026.11.19.')).toBeTruthy();
    });

    it('blocks a change while a payment is overdue and points at the payment methods', async () => {
        renderAt('/subscription/change?plan=pro-tier-03', mockSetup('?mock=past-due'));

        expect(await screen.findByText('Please pay the overdue amount first')).toBeTruthy();
        expect(screen.getByText('2026.11.06 (D-5)')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Payment methods' }).getAttribute('href')).toBe(
            '/subscription/payment-methods'
        );
        expect((screen.getByRole('button', { name: 'Pay and upgrade' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('asks an ending subscription to be resumed first', async () => {
        renderAt('/subscription/change?plan=pro-tier-03', mockSetup('?mock=cancel-scheduled'));

        expect(await screen.findByText('A subscription that is ending cannot change plan')).toBeTruthy();
    });

    it('reports a list that failed to load instead of reading it as no subscription', async () => {
        renderAt('/subscription/change?plan=pro-tier-01', mockSetup('?mock=active&fail=network'));

        expect(await screen.findByText(i18n.t('subscription.common.error.network'))).toBeTruthy();
        expect(where()).toBe('/subscription/change?plan=pro-tier-01');
    });

    it('sends a reader without a subscription to checkout', async () => {
        renderAt('/subscription/change?plan=pro-tier-01', mockSetup('?mock=new'));

        await waitFor(() => expect(where()).toBe('/subscription/checkout?plan=pro-tier-01'));
    });
});
