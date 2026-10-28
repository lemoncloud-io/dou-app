import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

/** A setup whose account already has a verified primary billing address, as after W-24. */
const withBillingEmail = async (search: string): Promise<PortSetup> => {
    const setup = mockSetup(search);
    await setup.port.adoptSignInEmail();
    return setup;
};

const Where = () => {
    const { pathname, search, state } = useLocation();
    return (
        <>
            <output data-testid="where">{pathname + search}</output>
            <output data-testid="state">{JSON.stringify(state)}</output>
        </>
    );
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

const EMAIL_STEP = '/subscription/checkout/email?plan=pro-tier-01';
const nextToDetails = () => screen.getByRole('button', { name: 'Next · Review your order' }) as HTMLButtonElement;

const requestCode = async (address: string) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Use another email' }));
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: address } });
    fireEvent.click(screen.getByRole('button', { name: 'Get a code' }));
    await screen.findByLabelText('6-digit code');
};

const enterCode = (code: string) => {
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
};

describe('W-24 email step', () => {
    it('offers a Google account its sign-in address and takes it to W-08 without a code', async () => {
        renderAt(EMAIL_STEP, mockSetup('?mock=new'));

        expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeTruthy();
        expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('minji.kim@gmail.com');
        expect(screen.getByText('✓ Google account email')).toBeTruthy();
        expect(screen.getByText('DoU Cloud 1')).toBeTruthy();

        fireEvent.click(nextToDetails());

        expect(await screen.findByRole('heading', { name: 'Review your order' })).toBeTruthy();
        expect(where()).toBe('/subscription/checkout?plan=pro-tier-01');
        expect(screen.getByText('minji.kim@gmail.com', { selector: 'span.truncate' })).toBeTruthy();
    });

    it('verifies another address by code, shows it verified and goes on to W-08', async () => {
        renderAt(EMAIL_STEP, mockSetup('?mock=new'));

        await requestCode('billing@minji-studio.kr');
        expect(nextToDetails().disabled).toBe(true);
        expect(screen.getByText('Verify your email to go on to the next step.')).toBeTruthy();

        enterCode('123456');

        expect(await screen.findByText(/^Verified\. Subscription notices go to this address/)).toBeTruthy();
        expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('billing@minji-studio.kr');
        expect(screen.getByRole('button', { name: 'Change email' })).toBeTruthy();
        await waitFor(() => expect(nextToDetails().disabled).toBe(false));

        fireEvent.click(nextToDetails());
        await waitFor(() => expect(where()).toBe('/subscription/checkout?plan=pro-tier-01'));
        expect(await screen.findByText('billing@minji-studio.kr', { selector: 'span.truncate' })).toBeTruthy();
    });

    it('counts a wrong code and stops the code after five', async () => {
        renderAt(EMAIL_STEP, mockSetup('?mock=new'));
        await requestCode('billing@minji-studio.kr');

        enterCode('482913');
        expect(await screen.findByText("That code isn't right. 4 tries left.")).toBeTruthy();
        for (const left of [3, 2, 1]) {
            enterCode('482913');
            expect(
                await screen.findByText(`That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.`)
            ).toBeTruthy();
        }
        enterCode('482913');

        expect(await screen.findByText('Too many wrong codes. Please get a new code.')).toBeTruthy();
        expect(nextToDetails().disabled).toBe(true);
    });

    it('reports a code that timed out', async () => {
        renderAt(EMAIL_STEP, mockSetup('?mock=new&fail=code-expired'));
        await requestCode('billing@minji-studio.kr');

        enterCode('123456');

        expect(await screen.findByText('The code has expired. Press Resend to get a new code.')).toBeTruthy();
    });

    it('reports the resend limit with the time asking works again', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            renderAt(EMAIL_STEP, mockSetup('?mock=new&fail=resend-limit'));
            await requestCode('billing@minji-studio.kr');

            vi.setSystemTime(Date.now() + 61_000);
            // The resend button re-reads the clock on the form's one-second tick, which stays real here.
            const resend = await screen.findByRole('button', { name: 'Resend' }, { timeout: 5000 });
            fireEvent.click(resend);

            expect(
                await screen.findByText('Too many codes requested. Please verify again in 10 minutes.')
            ).toBeTruthy();
            // The code step shuts until the lock lifts, counting down to it.
            expect(screen.getByText(/^Verify again in \d{2}:\d{2}$/)).toBeTruthy();
            expect(screen.getByLabelText('6-digit code').hasAttribute('disabled')).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('refuses a disposable address before sending a code', async () => {
        renderAt(EMAIL_STEP, mockSetup('?mock=new'));

        fireEvent.click(await screen.findByRole('button', { name: 'Use another email' }));
        fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'temp4821@mailinator.com' } });
        fireEvent.click(screen.getByRole('button', { name: 'Get a code' }));

        expect(
            await screen.findByText("Disposable addresses can't be used. Please enter an address you use regularly.")
        ).toBeTruthy();
        expect(screen.queryByLabelText('6-digit code')).toBeNull();
    });

    it('starts an Apple account from a blank address', async () => {
        renderAt(EMAIL_STEP, mockSetup('?mock=new-apple'));

        expect(await screen.findByText(/^ⓘ Signing in with Apple does not share an email address/)).toBeTruthy();
        expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('');
        expect(screen.queryByRole('button', { name: 'Use another email' })).toBeNull();
        expect(nextToDetails().disabled).toBe(true);
    });

    it('moves the primary mark onto the address taken here when it sat on one that bounced', async () => {
        const setup = mockSetup('?mock=new');
        setup.mock?.getState().billing.emails.push({
            id: 'em-old',
            address: 'old@lemon.example',
            primary: true,
            status: 'bounced',
            receives: ['receipt', 'notice'],
        });
        renderAt(EMAIL_STEP, setup);

        fireEvent.click(await screen.findByRole('button', { name: 'Next · Review your order' }));

        expect(await screen.findByRole('heading', { name: 'Review your order' })).toBeTruthy();
        expect(screen.getByText('minji.kim@gmail.com', { selector: 'span.truncate' })).toBeTruthy();
        // The dev panel follows the mock's state, so a direct read re-renders it.
        const { emails } = await act(() => setup.port.getBillingInfo());
        expect(emails.find(email => email.primary)?.address).toBe('minji.kim@gmail.com');
    });

    it('stays on the step and says why when taking the address fails', async () => {
        const setup = mockSetup('?mock=new');
        renderAt(EMAIL_STEP, setup);
        await screen.findByText('✓ Google account email');

        act(() => setup.mock?.setFail('network'));
        fireEvent.click(nextToDetails());

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toBe(i18n.t('subscription.common.error.network'));
        expect(where()).toBe(EMAIL_STEP);
    });

    it('shows a verified primary address as it is, with the change popup', async () => {
        renderAt(EMAIL_STEP, await withBillingEmail('?mock=new'));

        expect(await screen.findByText(/^Verified\. Subscription notices go to this address/)).toBeTruthy();
        expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('minji.kim@gmail.com');
        expect(nextToDetails().disabled).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
        expect(await screen.findByRole('dialog', { name: 'Change billing email' })).toBeTruthy();
    });

    it('sends a subscriber to the plan change instead', async () => {
        renderAt('/subscription/checkout/email?plan=pro-tier-03', mockSetup('?mock=active'));

        await waitFor(() => expect(where()).toBe('/subscription/change?plan=pro-tier-03'));
    });
});

const consentAll = async () => fireEvent.click(await screen.findByLabelText('Agree to all'));

const PAYER = { name: '김민지', phone: '01012345678', email: 'minji.kim@gmail.com' };

const fillPayer = async () => {
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: PAYER.name } });
    fireEvent.change(screen.getByLabelText('Mobile phone'), { target: { value: '010-1234-5678' } });
};

describe('W-08 checkout', () => {
    it('sends a reader without a verified billing email to W-24, keeping the plan', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', mockSetup('?mock=new'));

        await waitFor(() => expect(where()).toBe(EMAIL_STEP));
        expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeTruthy();
    });

    it('opens the way on once the payer and every consent are given, carrying them and the primary address', async () => {
        const setup = await withBillingEmail('?mock=new');
        const [primary] = (await setup.port.getBillingInfo()).emails;
        renderAt('/subscription/checkout?plan=pro-tier-01', setup);

        expect(await screen.findByRole('heading', { name: 'Review your order' })).toBeTruthy();
        expect(screen.getByText('Google · minji.kim@gmail.com')).toBeTruthy();
        expect(screen.getByText('minji.kim@gmail.com', { selector: 'span.truncate' })).toBeTruthy();
        expect(screen.getByText('✓ Verified')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Get a code' })).toBeNull();
        const next = screen.getByRole('button', { name: 'Next · Add a payment method' }) as HTMLButtonElement;
        expect(next.disabled).toBe(true);

        await consentAll();
        expect(next.disabled).toBe(true);
        await fillPayer();
        expect(next.disabled).toBe(false);

        fireEvent.change(screen.getByLabelText('Billing country'), { target: { value: 'US' } });
        expect(screen.getByText('Paying from outside Korea is coming soon')).toBeTruthy();
        expect(next.disabled).toBe(true);

        fireEvent.change(screen.getByLabelText('Billing country'), { target: { value: 'KR' } });
        fireEvent.click(next);
        await waitFor(() => expect(where()).toBe('/subscription/checkout/payment?plan=pro-tier-01'));
        expect(JSON.parse(screen.getByTestId('state').textContent ?? 'null')).toEqual({
            checkout: { country: 'KR', emailId: primary.id, payer: PAYER },
        });
    });

    it('changes the billing email through the popup and shows the new address', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', await withBillingEmail('?mock=new'));

        fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
        const dialog = await screen.findByRole('dialog', { name: 'Change billing email' });
        expect(within(dialog).getByText('minji.kim@gmail.com')).toBeTruthy();

        fireEvent.change(within(dialog).getByLabelText('New email'), { target: { value: 'billing@minji-studio.kr' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Get a code' }));
        fireEvent.change(await within(dialog).findByLabelText('6-digit code'), { target: { value: '123456' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Verify' }));
        const confirm = within(dialog).getByRole('button', { name: 'Change' }) as HTMLButtonElement;
        await waitFor(() => expect(confirm.disabled).toBe(false));
        fireEvent.click(confirm);

        expect(await screen.findByText('Billing email changed')).toBeTruthy();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByText('billing@minji-studio.kr', { selector: 'span.truncate' })).toBeTruthy();
        expect(where()).toBe('/subscription/checkout?plan=pro-tier-01');
    });

    it('shows a first payment without a trial', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', await withBillingEmail('?mock=new-trial-used'));

        expect(await screen.findByText('None — already used')).toBeTruthy();
        expect(screen.getByText('2026.11.01 (today)')).toBeTruthy();
    });

    it('sends a subscriber to the plan change instead', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-03', mockSetup('?mock=active'));

        await waitFor(() => expect(where()).toBe('/subscription/change?plan=pro-tier-03'));
    });
});

const toPayment = async () => {
    await fillPayer();
    await consentAll();
    fireEvent.click(screen.getByRole('button', { name: 'Next · Add a payment method' }));
    await screen.findByRole('heading', { name: 'Add a payment method' });
};

describe('W-05 card, W-09 and W-06', () => {
    it('goes back to W-08 when reached without its details', async () => {
        renderAt('/subscription/checkout/payment?plan=pro-tier-01', await withBillingEmail('?mock=new'));

        await waitFor(() => expect(where()).toBe('/subscription/checkout?plan=pro-tier-01'));
        expect(await screen.findByRole('heading', { name: 'Review your order' })).toBeTruthy();
    });

    it('registers a card, starts the trial and lands on W-06', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', await withBillingEmail('?mock=new'));
        await toPayment();

        fireEvent.click(screen.getByRole('button', { name: 'Add card and start free trial' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Registered' }));

        expect(await screen.findByText('Your DoU Cloud 1 free trial has started')).toBeTruthy();
        expect(where()).toMatch(/^\/subscription\/checkout\/complete\?attempt=att-\d+&plan=pro-tier-01$/);
        expect(screen.getByText('Until 2026.11.07')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Set up clouds in the app' })).toBeTruthy();
    });

    it('charges a first payment without a trial', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', await withBillingEmail('?mock=new-trial-used'));
        await toPayment();

        fireEvent.click(screen.getByRole('button', { name: 'Pay ₩8,600' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Registered' }));

        expect(await screen.findByText('You have subscribed to DoU Cloud 1')).toBeTruthy();
        expect(screen.getByText('2026.12.01')).toBeTruthy();
    });

    it('shows a declined card with the way back to the payment window', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', await withBillingEmail('?mock=new&fail=card-declined'));
        await toPayment();

        fireEvent.click(screen.getByRole('button', { name: 'Add card and start free trial' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Registered' }));

        expect(await screen.findByText('We could not add your card')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe(
            '/subscription/checkout/payment?plan=pro-tier-01'
        );
    });

    it('shows a closed payment window without starting anything', async () => {
        renderAt('/subscription/checkout?plan=pro-tier-01', await withBillingEmail('?mock=new-trial-used'));
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
