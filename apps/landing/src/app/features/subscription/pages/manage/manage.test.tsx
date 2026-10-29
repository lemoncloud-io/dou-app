import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import i18n from '../../../../../i18n';
import { ToastProvider } from '../../components/ui';
import { registerSubscriptionCopy } from '../../lib/i18n';
import { createMockPort } from '../../lib/mock';
import { savePendingCardChange } from '../../lib/pendingCheckout';
import { memoryStateStore } from '../../lib/mock/storage';
import { PortProvider, type PortSupports } from '../../lib/port';
import { HTTP_METHODS } from '../../lib/port/http';
import { ManagementScreensProvider } from '../../lib/screens';
import { CancelSubscriptionPage, SubscriptionDetailPage, SubscriptionListPage } from './index';

beforeAll(async () => {
    registerSubscriptionCopy();
    await i18n.changeLanguage('en');
});

const Where = () => {
    const { pathname, search } = useLocation();
    return <output data-testid="where">{pathname + search}</output>;
};

/**
 * Renders the three management routes on a fresh mock in the given scenario, starting at `url`. The card
 * and billing-email screens are open unless `management` says otherwise — they are hidden by default in
 * the app (`lib/screens.tsx`), and the tests below say what each hides.
 */
const renderAt = (
    url: string,
    search: string,
    {
        management = true,
        returned,
        supports,
    }: {
        management?: boolean;
        returned?: ReturnType<typeof createMockPort>['port']['completePaymentMethodRegistration'];
        supports?: PortSupports;
    } = {}
) => {
    const { port, clock } = createMockPort({
        store: memoryStateStore(),
        readSearch: () => `${search}&panel=0`,
        delayMs: 0,
    });
    // The mock's window never leaves the page, so what a provider's return would say is put in its place.
    if (returned) port.completePaymentMethodRegistration = returned;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <PortProvider port={port} clock={clock} supports={supports}>
                <ManagementScreensProvider open={management}>
                    <ToastProvider>
                        <MemoryRouter initialEntries={[url]}>
                            <Routes>
                                <Route path="/subscription" element={<SubscriptionListPage />} />
                                <Route path="/subscription/:subscriptionId" element={<SubscriptionDetailPage />} />
                                <Route
                                    path="/subscription/:subscriptionId/cancel"
                                    element={<CancelSubscriptionPage />}
                                />
                                <Route path="*" element={null} />
                            </Routes>
                            <Where />
                        </MemoryRouter>
                    </ToastProvider>
                </ManagementScreensProvider>
            </PortProvider>
        </QueryClientProvider>
    );
};

const where = () => screen.getByTestId('where').textContent;

/** What a tab on the server answers: only the methods it has a server for. */
const onServer: PortSupports = method => (HTTP_METHODS as ReadonlyArray<string>).includes(method);
const button = (name: string | RegExp) => screen.getByRole('button', { name });

describe('W-10 subscription list', () => {
    it('shows the subscription in force with its facts, and the ended one below', async () => {
        renderAt('/subscription', '?mock=active');

        expect(await screen.findByRole('heading', { name: 'DoU Cloud 2' })).toBeTruthy();
        expect(screen.getByText('2026.11.20')).toBeTruthy();
        expect(screen.getByText('₩17,200')).toBeTruthy();
        expect(await screen.findByText('신한 ···· 1234')).toBeTruthy();
        expect(screen.getByText('Ended subscriptions')).toBeTruthy();
        expect(screen.getByText('2026.08.20 – 2026.09.19 · Web · Replaced by the next subscription')).toBeTruthy();

        fireEvent.click(button('View subscription ›'));
        expect(where()).toBe('/subscription/sub-2');
    });

    it('draws a subscription with a failed payment as a status line', async () => {
        renderAt('/subscription', '?mock=past-due');

        expect(await screen.findByText('₩17,200 overdue · clouds restricted from 2026.11.06 (D-5)')).toBeTruthy();
        fireEvent.click(button('Details'));
        expect(where()).toBe('/subscription/sub-2');
    });

    it('says why each ended subscription ended', async () => {
        renderAt('/subscription', '?mock=history-mixed');

        expect(
            await screen.findByText('2026.08.20 – 2026.09.19 · Web · Replaced by the next subscription')
        ).toBeTruthy();
        expect(screen.getByText('2026.05.10 – 2026.07.17 · Web · Ended after a failed payment')).toBeTruthy();
    });

    it('sends a reader with no subscription to the plans', async () => {
        renderAt('/subscription', '?mock=new');

        expect(await screen.findByText('You have no subscription')).toBeTruthy();
        fireEvent.click(button('Subscribe'));
        expect(where()).toBe('/subscription/plans');
    });
});

describe('W-18 subscription detail', () => {
    it('draws the scene sceneOf picks, with its actions and the recent invoices', async () => {
        renderAt('/subscription/sub-2', '?mock=active');

        expect(await screen.findByText('Automatic payment scheduled')).toBeTruthy();
        expect(await screen.findByText('₩17,200 will be charged to 신한 ···· 1234 on 2026.11.20.')).toBeTruthy();
        expect(button('Change plan')).toBeTruthy();
        expect(button('Cancel subscription')).toBeTruthy();
        expect(await screen.findByText('DoU Cloud 2 · Renewal')).toBeTruthy();
        expect(screen.getByText('DoU Cloud 2 · First payment')).toBeTruthy();

        fireEvent.click(button('Cancel subscription'));
        expect(where()).toBe('/subscription/sub-2/cancel');
    });

    it('offers the adjacent plans and opens the change for the one picked', async () => {
        renderAt('/subscription/sub-2', '?mock=active');

        fireEvent.click(await screen.findByRole('button', { name: 'Change plan' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('DoU Cloud 1')).toBeTruthy();
        fireEvent.click(within(dialog).getByText('DoU Cloud 3'));
        expect(where()).toBe('/subscription/change?plan=pro-tier-03');
    });

    it('sends a failed payment to the payment methods', async () => {
        renderAt('/subscription/sub-2', '?mock=past-due');

        expect(await screen.findByText('Payment failed · D-5 until restriction')).toBeTruthy();
        expect(screen.getByText(/^The payment on 2026\.10\.30 failed \(카드 한도 초과\)\./)).toBeTruthy();
        expect(screen.getByText('10.31 · 11.02 · 11.04')).toBeTruthy();
        fireEvent.click(button('Change payment method'));
        expect(where()).toBe('/subscription/payment-methods');
    });

    it('undoes a cancellation after confirming', async () => {
        renderAt('/subscription/sub-2', '?mock=cancel-scheduled');

        expect(await screen.findByText('Your subscription ends on 2026.11.20 · D-19')).toBeTruthy();
        await waitFor(() => expect(button('Undo cancellation').hasAttribute('disabled')).toBe(false));
        fireEvent.click(button('Undo cancellation'));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Undo the cancellation?')).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Undo cancellation' }));

        expect(await screen.findByText('Your subscription continues')).toBeTruthy();
        expect(await screen.findByText('Automatic payment scheduled')).toBeTruthy();
    });

    it('sends a cancelled subscription with no card to add one instead of resuming', async () => {
        renderAt('/subscription/sub-2', '?mock=cancel-scheduled&cards=0');

        await screen.findByText('Your subscription ends on 2026.11.20 · D-19');
        await waitFor(() => expect(button('Undo cancellation').hasAttribute('disabled')).toBe(false));
        fireEvent.click(button('Undo cancellation'));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('No card to charge')).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Add a card' }));
        expect(where()).toBe('/subscription/payment-methods');
    });

    it('cancels a scheduled downgrade after confirming', async () => {
        renderAt('/subscription/sub-4', '?mock=downgrade-scheduled');

        expect(await screen.findByText('DoU Cloud 2 applies from 2026.11.20')).toBeTruthy();
        fireEvent.click(button('Cancel the change'));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel the change' }));

        expect(await screen.findByText('The scheduled downgrade is cancelled')).toBeTruthy();
        expect(await screen.findByText('Automatic payment scheduled')).toBeTruthy();
    });

    it('refuses to cancel a downgrade on the day it applies', async () => {
        renderAt('/subscription/sub-4', '?mock=downgrade-scheduled&now=2026-11-20');

        fireEvent.click(await screen.findByRole('button', { name: 'Cancel the change' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText("The change can't be cancelled today")).toBeTruthy();
        expect(within(dialog).queryByRole('button', { name: 'Cancel the change' })).toBeNull();
    });

    it('points a bounced primary billing email to billing info', async () => {
        renderAt('/subscription/sub-2', '?mock=email-pending');

        expect(await screen.findByText('Check your billing email')).toBeTruthy();
        fireEvent.click(button('Billing info'));
        expect(where()).toBe('/subscription/billing-info');
    });

    describe('with the card and billing-email screens hidden', () => {
        it('draws the card tile with a way to change the card, and no way into the card list', async () => {
            renderAt('/subscription/sub-2', '?mock=active', { management: false });

            await screen.findByText('Automatic payment scheduled');
            expect(screen.getByText('Payment method')).toBeTruthy();
            expect(screen.queryByRole('button', { name: 'Payment methods' })).toBeNull();
            expect(button('Change card')).toBeTruthy();
            // What stays: the plan change, cancelling and the billing history.
            expect(button('Change plan')).toBeTruthy();
            expect(button('Cancel subscription')).toBeTruthy();
        });

        it('changes the card through the payer form and the payment window', async () => {
            renderAt('/subscription/sub-2', '?mock=active', { management: false });

            await screen.findByText('Automatic payment scheduled');
            fireEvent.click(button('Change card'));
            const dialog = await screen.findByRole('dialog');
            const open = within(dialog).getByRole('button', { name: 'Open payment window' }) as HTMLButtonElement;
            expect(open.disabled).toBe(true);
            fireEvent.change(within(dialog).getByLabelText(/name/i), { target: { value: 'Minji Kim' } });
            fireEvent.change(within(dialog).getByLabelText(/mobile/i), { target: { value: '01012345678' } });
            expect(open.disabled).toBe(false);
            fireEvent.click(open);

            expect(await screen.findByText('Your payment card was changed.')).toBeTruthy();
        });

        it('reads a payment window that came back through the address, and clears the address', async () => {
            savePendingCardChange({ name: 'Minji Kim', phone: '01012345678', email: 'minji.kim@gmail.com' });
            const returned = vi.fn(async () => ({ outcome: 'registered' as const, card: 'pm-9' as never }));
            renderAt('/subscription/sub-2?billingKey=billing-key-9', '?mock=active', { management: false, returned });

            expect(await screen.findByText('Your payment card was changed.')).toBeTruthy();
            expect(returned).toHaveBeenCalledWith(
                expect.objectContaining({ purpose: 'addCard', payer: expect.objectContaining({ name: 'Minji Kim' }) })
            );
            expect(where()).toBe('/subscription/sub-2');
        });

        it('ignores a return it has nothing saved for, but still clears the address', async () => {
            renderAt('/subscription/sub-2?billingKey=billing-key-9', '?mock=active', { management: false });

            await screen.findByText('Automatic payment scheduled');
            expect(screen.queryByText('Your payment card was changed.')).toBeNull();
            expect(where()).toBe('/subscription/sub-2');
        });

        it('leads a failed payment to the card change instead of the card list', async () => {
            renderAt('/subscription/sub-2', '?mock=past-due', { management: false });

            expect(await screen.findByText('Payment failed · D-5 until restriction')).toBeTruthy();
            fireEvent.click(button('Change payment method'));
            expect(await screen.findByRole('dialog')).toBeTruthy();
            expect(where()).toBe('/subscription/sub-2');
        });

        it('does not ask for a billing email check where it cannot be done', async () => {
            renderAt('/subscription/sub-2', '?mock=email-pending', { management: false });

            await screen.findByText('Automatic payment scheduled');
            expect(screen.queryByText('Check your billing email')).toBeNull();
        });

        it('tells a cancelled subscription with no card that nothing can be added, rather than sending it away', async () => {
            renderAt('/subscription/sub-2', '?mock=cancel-scheduled&cards=0', { management: false });

            await screen.findByText('Your subscription ends on 2026.11.20 · D-19');
            await waitFor(() => expect(button('Undo cancellation').hasAttribute('disabled')).toBe(false));
            fireEvent.click(button('Undo cancellation'));
            const dialog = await screen.findByRole('dialog');
            expect(within(dialog).getByText('No card to charge')).toBeTruthy();
            expect(within(dialog).getByText(/cards cannot be added here yet/)).toBeTruthy();
            expect(within(dialog).queryByRole('button', { name: 'Add a card' })).toBeNull();
            expect(where()).toBe('/subscription/sub-2');
        });
    });

    it('gives an expired subscription the last day to restore its clouds', async () => {
        renderAt('/subscription/sub-2', '?mock=expired');

        expect(await screen.findByText('Your subscription expired on 2026.10.20')).toBeTruthy();
        expect(
            screen.getByText('Your clouds are restricted. Subscribe again by 2026.11.19 to pick up the clouds you had.')
        ).toBeTruthy();
        fireEvent.click(button('Subscribe again'));
        expect(where()).toBe('/subscription/plans');
    });

    it("shows a replaced subscription without resubscribing or the live one's invoices", async () => {
        renderAt('/subscription/sub-1', '?mock=active');

        expect(await screen.findByText('Replaced by the next subscription on 2026.09.19')).toBeTruthy();
        expect(screen.queryByText(/Subscribe again by/)).toBeNull();
        expect(screen.queryByRole('button', { name: 'Subscribe again' })).toBeNull();
        await waitFor(() => expect(screen.queryByText('Recent billing')).toBeNull());
    });

    it('says so when the subscription does not exist', async () => {
        renderAt('/subscription/sub-404', '?mock=active');

        expect(await screen.findByText("We couldn't find this subscription")).toBeTruthy();
    });
});

describe('W-15 cancel subscription', () => {
    it('cancels and then shows when the subscription ends', async () => {
        renderAt('/subscription/sub-2/cancel', '?mock=active');

        expect(await screen.findByText('Ends on')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'View the refund policy' }).getAttribute('href')).toBe(
            '/policy/refund'
        );
        fireEvent.click(button('Cancel subscription'));

        expect(await screen.findByRole('heading', { name: 'You cancelled your subscription' })).toBeTruthy();
        expect(screen.getByText('You can use it until 2026.11.20')).toBeTruthy();
    });

    it('lets the reader undo the cancellation from the result', async () => {
        renderAt('/subscription/sub-2/cancel', '?mock=cancel-scheduled');

        await screen.findByRole('heading', { name: 'You cancelled your subscription' });
        await waitFor(() => expect(button('Undo cancellation').hasAttribute('disabled')).toBe(false));
        fireEvent.click(button('Undo cancellation'));
        expect(await screen.findByText('Undo the cancellation?')).toBeTruthy();
        fireEvent.click(screen.getAllByRole('button', { name: 'Undo cancellation' })[1]);

        await waitFor(() => expect(where()).toBe('/subscription/sub-2'));
    });

    it('offers a retry when the subscription does not load', async () => {
        renderAt('/subscription/sub-2/cancel', '?mock=active&fail=network');

        expect(await screen.findByText('The connection is unstable. Please try again shortly.')).toBeTruthy();
        fireEvent.click(button('Try again'));
        expect(await screen.findByText('Ends on')).toBeTruthy();
    });

    it('offers no cancellation for a subscription whose payment failed', async () => {
        renderAt('/subscription/sub-2/cancel', '?mock=past-due');

        expect(await screen.findByText("You can't cancel right now")).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Cancel subscription' })).toBeNull();
    });
});

describe('against the server, which answers only some of the calls', () => {
    it('leaves out undoing a cancellation and the recent billing, and does not promise the undo', async () => {
        renderAt('/subscription/sub-2', '?mock=cancel-scheduled', { supports: onServer });

        await screen.findByText('Your subscription ends on 2026.11.20 · D-19');
        expect(screen.queryByRole('button', { name: 'Undo cancellation' })).toBeNull();
        expect(screen.queryByText('Recent billing')).toBeNull();
    });

    it('leaves out cancelling a scheduled downgrade', async () => {
        renderAt('/subscription/sub-4', '?mock=downgrade-scheduled', { supports: onServer });

        await screen.findByText('DoU Cloud 2 applies from 2026.11.20');
        expect(screen.queryByRole('button', { name: 'Cancel the change' })).toBeNull();
    });

    it('lists an ending subscription without saying it can be undone', async () => {
        renderAt('/subscription', '?mock=cancel-scheduled', { supports: onServer });

        expect(await screen.findByText(/automatic payment stopped$/)).toBeTruthy();
        expect(screen.queryByText(/undo the cancellation/)).toBeNull();
    });

    it('confirms a cancellation without the way back', async () => {
        renderAt('/subscription/sub-2/cancel', '?mock=cancel-scheduled', { supports: onServer });

        expect(await screen.findByText('You cancelled your subscription')).toBeTruthy();
        expect(
            screen.getByText("You won't be charged again. You can keep using it as before until it ends.")
        ).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Undo cancellation' })).toBeNull();
    });
});
