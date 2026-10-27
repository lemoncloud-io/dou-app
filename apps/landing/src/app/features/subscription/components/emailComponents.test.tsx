import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import i18n from '../../../../i18n';
import { registerSubscriptionCopy } from '../lib/i18n';
import { createMockPort } from '../lib/mock';
import { memoryStateStore } from '../lib/mock/storage';
import { PortProvider } from '../lib/port';
import { BillingEmailChangeDialog } from './BillingEmailChangeDialog';
import { EmailVerificationForm } from './EmailVerificationForm';
import { ToastProvider } from './ui';

import type { BillingEmail } from '../types';

registerSubscriptionCopy();

beforeAll(() => i18n.changeLanguage('en'));

const mount = (search: string, ui: ReactNode) => {
    const mock = createMockPort({ store: memoryStateStore(), readSearch: () => search, delayMs: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <PortProvider port={mock.port} clock={mock.clock}>
                <ToastProvider>{ui}</ToastProvider>
            </PortProvider>
        </QueryClientProvider>
    );
    return mock;
};

const typeAddress = (value: string) => fireEvent.change(screen.getByLabelText('Email'), { target: { value } });

describe('EmailVerificationForm', () => {
    it('sends a code with its countdowns, counts a wrong code and verifies the right one', async () => {
        const onVerified = vi.fn();
        mount('?mock=new', <EmailVerificationForm idPrefix="t" label="Email" onVerified={onVerified} />);

        typeAddress('billing@lemon.example');
        fireEvent.click(screen.getByRole('button', { name: 'Get a code' }));

        expect(await screen.findByText(/left$/)).toBeTruthy();
        expect(screen.getByText('05:00 left')).toBeTruthy();
        expect(screen.getByRole('button', { name: /^Resend \(\d+s\)$/ }).hasAttribute('disabled')).toBe(true);
        expect(screen.getByText('We sent a code to billing@lemon.example. Enter it within 5 minutes.')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '000000' } });
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
        expect(await screen.findByText("That code isn't right. 4 tries left.")).toBeTruthy();

        fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
        await waitFor(() => expect(onVerified).toHaveBeenCalled());
        expect((onVerified.mock.calls[0][0] as BillingEmail).address).toBe('billing@lemon.example');
        expect(screen.getByText('✓ Verified')).toBeTruthy();
    });

    it('refuses a throwaway address', async () => {
        mount('?mock=new', <EmailVerificationForm idPrefix="t" label="Email" onVerified={vi.fn()} />);

        typeAddress('temp4821@mailinator.com');
        fireEvent.click(screen.getByRole('button', { name: 'Get a code' }));

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.getByText(/Disposable addresses can't be used/)).toBeTruthy();
    });

    it('shuts the code field and says so once the code runs out', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            mount('?mock=new', <EmailVerificationForm idPrefix="t" label="Email" onVerified={vi.fn()} />);
            typeAddress('billing@lemon.example');
            fireEvent.click(screen.getByRole('button', { name: 'Get a code' }));
            await screen.findByLabelText('6-digit code');

            vi.setSystemTime(Date.now() + 5 * 60_000 + 1000);
            expect(
                await screen.findByText('The code has expired. Press Resend to get a new code.', undefined, {
                    timeout: 3000,
                })
            ).toBeTruthy();
            expect(screen.getByLabelText('6-digit code').hasAttribute('disabled')).toBe(true);
            expect(screen.getByText('00:00')).toBeTruthy();
        } finally {
            vi.useRealTimers();
        }
    });

    it('says when a code has expired', async () => {
        mount('?mock=new&fail=code-expired', <EmailVerificationForm idPrefix="t" label="Email" onVerified={vi.fn()} />);

        typeAddress('billing@lemon.example');
        fireEvent.click(screen.getByRole('button', { name: 'Get a code' }));
        fireEvent.change(await screen.findByLabelText('6-digit code'), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

        expect(await screen.findByText('The code has expired. Press Resend to get a new code.')).toBeTruthy();
    });
});

describe('BillingEmailChangeDialog', () => {
    const current: BillingEmail = {
        id: 'em-1',
        address: 'minji.kim@gmail.com',
        primary: true,
        status: 'verified',
        receives: ['receipt', 'notice'],
    };

    const verifyNew = async (address: string) => {
        fireEvent.change(await screen.findByLabelText('New email'), { target: { value: address } });
        fireEvent.click(screen.getByRole('button', { name: 'Get a code' }));
        fireEvent.change(await screen.findByLabelText('6-digit code'), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
        await screen.findByText('✓ Verified');
    };

    it('refuses the current address', async () => {
        mount('?mock=active', <BillingEmailChangeDialog current={current} where="billing" onClose={vi.fn()} />);

        fireEvent.change(await screen.findByLabelText('New email'), { target: { value: 'Minji.Kim@gmail.com' } });
        fireEvent.click(screen.getByRole('button', { name: 'Get a code' }));

        expect(await screen.findByText("That's the current address.")).toBeTruthy();
    });

    it('swaps a verified new address in at once', async () => {
        const onClose = vi.fn();
        const mock = mount(
            '?mock=active',
            <BillingEmailChangeDialog current={current} where="billing" onClose={onClose} />
        );

        expect(screen.getByRole('button', { name: 'Change' }).hasAttribute('disabled')).toBe(true);
        await verifyNew('billing@lemon.example');
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(await screen.findByText('Billing email changed')).toBeTruthy();
        const { emails } = await mock.port.getBillingInfo();
        expect(emails.map(e => [e.address, e.primary])).toEqual([['billing@lemon.example', true]]);
    });

    it('changes nothing when closed after a code was sent', async () => {
        const onClose = vi.fn();
        const mock = mount(
            '?mock=active',
            <BillingEmailChangeDialog current={current} where="checkout" onClose={onClose} />
        );

        fireEvent.change(await screen.findByLabelText('New email'), { target: { value: 'billing@lemon.example' } });
        fireEvent.click(screen.getByRole('button', { name: 'Get a code' }));
        await screen.findByLabelText('6-digit code');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalled();
        await waitFor(async () =>
            expect((await mock.port.getBillingInfo()).emails.map(e => e.address)).toEqual(['minji.kim@gmail.com'])
        );
    });
});
