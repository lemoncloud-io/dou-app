import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import i18n from '../../../../../i18n';
import { createMockPort } from '../../lib/mock';
import { MOCK_POLICY } from '../../lib/mock/policy';
import { memoryStateStore } from '../../lib/mock/storage';
import { SubscriptionRoutes } from '../../routes';

import type { PortSetup } from '../../lib/createPortSetup';

// The pages are rendered through the real routes, so they sit in the account shell with the port,
// the query client, the toasts and the stand-in payment window exactly as a reader meets them.

beforeAll(async () => {
    // jsdom has no matchMedia; a desktop-width viewport keeps the phone-width notice away.
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    await i18n.changeLanguage('en');
});

const mockSetup = (search: string): PortSetup => {
    const { port, clock, controller } = createMockPort({
        store: memoryStateStore(),
        readSearch: () => `${search}&panel=0`,
        delayMs: 0,
    });
    return { port, clock, mock: controller };
};

const Where = () => {
    const { pathname, search } = useLocation();
    return <output data-testid="where">{pathname + search}</output>;
};

const renderAt = (url: string, search: string) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <Routes>
                <Route path="/subscription/*" element={<SubscriptionRoutes setup={mockSetup(search)} />} />
            </Routes>
            <Where />
        </MemoryRouter>
    );

const where = () => screen.getByTestId('where').textContent;

const cardRow = async (label: string) => (await screen.findByText(label)).closest('li') as HTMLElement;

// The account menu in the sidebar prints the sign-in address too; the row is the one in a list item.
const emailRow = (address: string) =>
    waitFor(() => {
        const row = screen
            .getAllByText(address)
            .map(node => node.closest('li'))
            .find(Boolean);
        expect(row).toBeTruthy();
        return row as HTMLElement;
    });

describe('W-12 payment methods', () => {
    const url = '/subscription/payment-methods';

    it('lists the cards with the default one marked', async () => {
        renderAt(url, '?mock=active');

        const first = await cardRow('신한 ···· 1234');
        expect(within(first).getByText('Default')).toBeTruthy();
        expect(within(first).getByText('Expires 04/29')).toBeTruthy();
        expect(within(first).queryByRole('button', { name: 'Make default' })).toBeNull();
        const second = await cardRow('현대 ···· 5678');
        expect(within(second).getByRole('button', { name: 'Make default' })).toBeTruthy();
    });

    it('explains instead of removing the default card', async () => {
        renderAt(url, '?mock=active');

        fireEvent.click(within(await cardRow('신한 ···· 1234')).getByRole('button', { name: 'Remove' }));

        const dialog = await screen.findByRole('dialog', { name: "Your default card can't be removed yet" });
        fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
        expect(screen.getByText('신한 ···· 1234')).toBeTruthy();
    });

    it('removes another card once confirmed', async () => {
        renderAt(url, '?mock=active');

        fireEvent.click(within(await cardRow('현대 ···· 5678')).getByRole('button', { name: 'Remove' }));
        const dialog = await screen.findByRole('dialog', { name: 'Remove 현대 ···· 5678?' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

        expect(await screen.findByText('Card removed')).toBeTruthy();
        expect(screen.queryByText('현대 ···· 5678')).toBeNull();
    });

    it('keeps the last card of a live subscription and offers to add another', async () => {
        renderAt(url, '?mock=past-due');

        fireEvent.click(within(await cardRow('신한 ···· 1234')).getByRole('button', { name: 'Remove' }));

        const dialog = await screen.findByRole('dialog', { name: "Your last card can't be removed" });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Add card' }));
        expect(await screen.findByRole('dialog', { name: 'Add card' })).toBeTruthy();
    });

    it('makes another card the default after confirming', async () => {
        renderAt(url, '?mock=active');

        fireEvent.click(within(await cardRow('현대 ···· 5678')).getByRole('button', { name: 'Make default' }));
        const dialog = await screen.findByRole('dialog', { name: 'Change your default card?' });
        expect(
            within(dialog).getByText('From the next payment (2026.11.20 · ₩17,200), 현대 ···· 5678 is charged.')
        ).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Make default' }));

        expect(await screen.findByText('Default card changed')).toBeTruthy();
        await waitFor(() =>
            expect(
                within(screen.getByText('현대 ···· 5678').closest('li') as HTMLElement).getByText('Default')
            ).toBeTruthy()
        );
    });

    it('adds a card through the payment window', async () => {
        renderAt(url, '?mock=active');

        fireEvent.click(await screen.findByRole('button', { name: 'Add card' }));
        fireEvent.click(
            within(await screen.findByRole('dialog', { name: 'Add card' })).getByRole('button', {
                name: 'Open payment window',
            })
        );
        fireEvent.click(
            within(await screen.findByRole('dialog', { name: 'Add a card' })).getByRole('button', {
                name: 'Registered',
            })
        );

        expect(await screen.findByText(/···· \d{4} added$/)).toBeTruthy();
        const list = screen.getByRole('list', { name: 'Payment methods' });
        await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    });

    it('says why a card was not added when the issuer declines it', async () => {
        renderAt(url, '?mock=active&fail=card-declined');

        fireEvent.click(await screen.findByRole('button', { name: 'Add card' }));
        fireEvent.click(
            within(await screen.findByRole('dialog', { name: 'Add card' })).getByRole('button', {
                name: 'Open payment window',
            })
        );
        fireEvent.click(
            within(await screen.findByRole('dialog', { name: 'Add a card' })).getByRole('button', {
                name: 'Registration failed',
            })
        );

        expect(await screen.findByText("We couldn't add the card")).toBeTruthy();
    });

    it('stops at the attempt limit before the payment window opens', async () => {
        renderAt(url, '?mock=active&fail=attempt-limit');

        fireEvent.click(await screen.findByRole('button', { name: 'Add card' }));
        fireEvent.click(
            within(await screen.findByRole('dialog', { name: 'Add card' })).getByRole('button', {
                name: 'Open payment window',
            })
        );

        expect(await screen.findByText('Too many attempts')).toBeTruthy();
        expect(screen.queryByRole('dialog', { name: 'Add a card' })).toBeNull();
    });

    it('warns when the default card expires before the next payment', async () => {
        renderAt(url, '?mock=active-card-expiring');

        expect(await screen.findByText('Your default card expires before the next payment')).toBeTruthy();
        expect(
            screen.getByText(
                '신한 ···· 1234 expires in 2026.11. Add a new card and make it the default before the 2026.11.20 payment.'
            )
        ).toBeTruthy();
        expect(within(await cardRow('신한 ···· 1234')).getByText('Expiring soon')).toBeTruthy();
    });

    it('while a payment is failing, charges the overdue amount to the card just added', async () => {
        renderAt(url, '?mock=past-due');

        expect(await screen.findByText('₩17,200 overdue · 5 days until access is restricted')).toBeTruthy();
        expect(within(await cardRow('신한 ···· 1234')).getByText('Payment failed · 카드 한도 초과')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
        fireEvent.click(
            within(await screen.findByRole('dialog', { name: 'Add card' })).getByRole('button', {
                name: 'Open payment window',
            })
        );
        fireEvent.click(
            within(await screen.findByRole('dialog', { name: 'Add a card' })).getByRole('button', {
                name: 'Registered',
            })
        );

        expect(await screen.findByText(/^Make .+ the default and pay now\?$/)).toBeTruthy();
        expect(screen.getByText('Day 30 of each month (unchanged)')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Make default and pay ₩17,200' }));

        await waitFor(() => expect(where()).toMatch(/^\/subscription\/checkout\/status\?attempt=.+/));
    });

    it('counts a single day left in the singular', async () => {
        renderAt(url, '?mock=past-due&now=2026-11-05');

        expect(await screen.findByText('₩17,200 overdue · 1 day until access is restricted')).toBeTruthy();
    });

    it('says access is already restricted once it is', async () => {
        renderAt(url, '?mock=restricted');

        expect(await screen.findByText('₩17,200 overdue · access is restricted')).toBeTruthy();
    });
});

describe('W-13 billing history', () => {
    const url = '/subscription/history';

    it('lists payments newest first with their receipts', async () => {
        renderAt(url, '?mock=active');

        const rows = (await screen.findAllByRole('row')).slice(1);
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getByText('Renewal · DoU Cloud 2')).toBeTruthy();
        expect(within(rows[0]).getByText('2026.10.20')).toBeTruthy();
        expect(within(rows[0]).getByText('Paid')).toBeTruthy();
        expect(within(rows[0]).getByRole('link').getAttribute('href')).toBe('/subscription/mock-receipt?invoice=inv-2');
        expect(within(rows[1]).getByText('First payment · DoU Cloud 2')).toBeTruthy();
    });

    it('shows failed, retried and refunded rows, with no receipt for a failed charge', async () => {
        renderAt(url, '?mock=history-mixed');

        const rows = (await screen.findAllByRole('row')).slice(1);
        const refund = rows.find(row => within(row).queryByText('Refund · DoU Cloud 1')) as HTMLElement;
        expect(within(refund).getByText('-₩8,600')).toBeTruthy();
        expect(within(refund).getByRole('link', { name: /Refund receipt/ })).toBeTruthy();
        const failed = rows.find(row => within(row).queryByText('Failed')) as HTMLElement;
        expect(within(failed).queryByRole('link')).toBeNull();
        expect(rows.some(row => within(row).queryByText('Renewal (retry) · DoU Cloud 2'))).toBe(true);
    });

    it('marks the failed charge that is still being retried', async () => {
        renderAt(url, '?mock=past-due');

        const rows = (await screen.findAllByRole('row')).slice(1);
        expect(within(rows[0]).getByText('Failed · retrying 2026.11.02')).toBeTruthy();
        expect(within(rows[0]).queryByRole('link')).toBeNull();
    });

    it('during a trial, says when the first payment is due', async () => {
        renderAt(url, '?mock=trial');

        expect(await screen.findByText('No payments yet')).toBeTruthy();
        expect(screen.getByText("You're on a free trial. The first payment (₩8,600) is on 2026.11.06.")).toBeTruthy();
    });
});

describe('W-16 billing info', () => {
    const url = '/subscription/billing-info';

    const enterCode = async (dialog: HTMLElement, code: string) => {
        fireEvent.change(await within(dialog).findByLabelText('Verification code'), { target: { value: code } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Verify' }));
    };

    it('shows the billing emails and a country that cannot be changed', async () => {
        renderAt(url, '?mock=active');

        const row = await emailRow('minji.kim@gmail.com');
        expect(within(row).getByText('Primary')).toBeTruthy();
        expect(within(row).queryByRole('button', { name: 'Remove' })).toBeNull();
        expect(screen.getByText('South Korea')).toBeTruthy();
        expect(screen.getByText("Can't be changed")).toBeTruthy();
    });

    it('flags a bouncing primary address and finishes a pending verification', async () => {
        renderAt(url, '?mock=email-pending');

        expect(await screen.findByText('Your primary billing email is bouncing')).toBeTruthy();
        const pending = await emailRow('billing@lemon.example');
        expect(within(pending).getByText('Awaiting verification')).toBeTruthy();

        fireEvent.click(within(pending).getByRole('button', { name: 'Verify' }));
        const dialog = await screen.findByRole('dialog', { name: 'Add billing email' });
        await enterCode(dialog, '000000');
        expect(await within(dialog).findByText("That code doesn't match. Please check it.")).toBeTruthy();
        await enterCode(dialog, MOCK_POLICY.emailCode);
        expect(await within(dialog).findByText('✓ Verified')).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

        expect(await screen.findByText('Billing email added')).toBeTruthy();
        await waitFor(() => expect(screen.queryByText('Awaiting verification')).toBeNull());
    });

    it('changes the primary address once the new one is verified', async () => {
        renderAt(url, '?mock=active');

        const current = await emailRow('minji.kim@gmail.com');
        fireEvent.click(within(current).getByRole('button', { name: 'Change' }));
        const dialog = await screen.findByRole('dialog', { name: 'Change billing email' });
        expect(within(dialog).getByRole('button', { name: 'Change' }).hasAttribute('disabled')).toBe(true);

        fireEvent.change(within(dialog).getByLabelText('New email'), { target: { value: 'not-an-address' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
        expect(await within(dialog).findByText('Check the email address.')).toBeTruthy();

        fireEvent.change(within(dialog).getByLabelText('New email'), { target: { value: 'accounting@lemon.example' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
        expect(await within(dialog).findByText('We sent a code to accounting@lemon.example.')).toBeTruthy();
        await enterCode(dialog, MOCK_POLICY.emailCode);
        await within(dialog).findByText('✓ Verified');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Change' }));

        expect(await screen.findByText('Billing email changed')).toBeTruthy();
        const added = await emailRow('accounting@lemon.example');
        await waitFor(() => expect(within(added).getByText('Primary')).toBeTruthy());
    });

    it('turns off one kind of billing mail for an address', async () => {
        renderAt(url, '?mock=active');

        const notices = await screen.findByRole('checkbox', { name: 'Payment notices' });
        expect((notices as HTMLInputElement).checked).toBe(true);
        fireEvent.click(notices);

        await waitFor(() =>
            expect((screen.getByRole('checkbox', { name: 'Payment notices' }) as HTMLInputElement).checked).toBe(false)
        );
        expect((screen.getByRole('checkbox', { name: 'Receipts' }) as HTMLInputElement).checked).toBe(true);
    });

    it('says an address is already verified instead of sending it a code', async () => {
        renderAt(url, '?mock=active');

        fireEvent.click(await screen.findByRole('button', { name: '+ Add email' }));
        const dialog = await screen.findByRole('dialog', { name: 'Add billing email' });
        fireEvent.change(within(dialog).getByLabelText('New email'), { target: { value: 'minji.kim@gmail.com' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));

        expect(
            await within(dialog).findByText('That address is already verified. You can make it primary from the list.')
        ).toBeTruthy();
    });

    it('refuses another address past the limit', async () => {
        renderAt(url, '?mock=active');

        // The scenario has one address; fill the rest of the allowance with pending ones.
        for (let n = 1; n < MOCK_POLICY.maxBillingEmails; n++) {
            fireEvent.click(await screen.findByRole('button', { name: '+ Add email' }));
            const dialog = await screen.findByRole('dialog', { name: 'Add billing email' });
            fireEvent.change(within(dialog).getByLabelText('New email'), {
                target: { value: `extra${n}@lemon.example` },
            });
            fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
            await within(dialog).findByLabelText('Verification code');
            fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
            await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        }

        fireEvent.click(await screen.findByRole('button', { name: '+ Add email' }));
        const dialog = await screen.findByRole('dialog', { name: 'Add billing email' });
        fireEvent.change(within(dialog).getByLabelText('New email'), {
            target: { value: 'one-too-many@lemon.example' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));

        expect(
            await within(dialog).findByText(
                "You can't add more billing emails. Remove one you don't use and try again."
            )
        ).toBeTruthy();
    });
});
