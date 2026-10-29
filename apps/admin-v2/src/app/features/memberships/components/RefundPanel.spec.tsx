/**
 * `components/memberships/RefundPanel.spec.tsx`
 *
 * The refund panel as an operator meets it: closed on Production, open on Development, a reason
 * required before the dialog will fire, and the call aimed at exactly the relay the dialog names.
 * The relay itself is mocked — nothing here can move money.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refundSubscriptionByAdmin = vi.fn();
const fetchAdminClouds = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ subscription: { refundSubscriptionByAdmin, fetchAdminClouds } }) },
    },
}));

vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn() } }));

import { MembershipDetailPanel } from './MembershipDetailPanel';
import { RefundPanel } from './RefundPanel';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';
import type { RelayStage } from '../lib/targetServer';

const PROD = 'https://api.example.com/dou-v1';
const DEV = 'https://api.example.com/dou-d1';

const membership = (over: Record<string, unknown> = {}): MembershipView =>
    ({
        userId: '1000904',
        platform: 'portone',
        status: 'active',
        productId: '#dou-web-tier-01_dev',
        ...over,
    }) as unknown as MembershipView;

const withClient = (ui: React.ReactElement) =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            {ui}
        </QueryClientProvider>
    );

const renderPanel = (stage: RelayStage, over: Record<string, unknown> = {}) =>
    withClient(<RefundPanel membership={membership(over)} stage={stage} />);

const refundButton = () => screen.getByRole('button', { name: 'Refund web subscription' });

beforeEach(() => {
    refundSubscriptionByAdmin.mockReset();
    fetchAdminClouds.mockResolvedValue({ list: [] });
    // Operators' `.env` usually names Production; the console reaches Development by stage switch.
    vi.stubEnv('VITE_DOU_ENDPOINT', PROD);
});

afterEach(() => vi.unstubAllEnvs());

describe('RefundPanel', () => {
    it('is disabled on Production and says why', () => {
        renderPanel('v1');

        expect((refundButton() as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(/Production refunds are not open yet/)).toBeTruthy();
    });

    it('is enabled on Development', () => {
        renderPanel('d1');

        expect((refundButton() as HTMLButtonElement).disabled).toBe(false);
    });

    it('stays shut when the configured endpoint names no stage, even on Development', () => {
        vi.stubEnv('VITE_DOU_ENDPOINT', 'https://relay.example.com');
        renderPanel('d1');

        expect((refundButton() as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(/No relay to refund on/)).toBeTruthy();
    });

    it('is disabled for an expired membership', () => {
        renderPanel('d1', { status: 'expired' });

        expect((refundButton() as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(/Already expired/)).toBeTruthy();
    });

    it('names Development in the dialog and needs a reason before it fires', async () => {
        refundSubscriptionByAdmin.mockResolvedValue({ status: 'expired', validUntil: 1_800_000_000_000 });
        renderPanel('d1');

        fireEvent.click(refundButton());
        expect(screen.getByText('Development')).toBeTruthy();
        expect(screen.getByText(DEV)).toBeTruthy();

        const confirm = screen.getByRole('button', { name: 'Refund' });
        expect((confirm as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'test refund' } });
        expect((confirm as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(confirm);

        await waitFor(() => expect(screen.getByText(/subscription status is now expired/)).toBeTruthy());
        expect(refundSubscriptionByAdmin).toHaveBeenCalledWith('1000904', { reason: 'test refund' }, { endpoint: DEV });
        expect((refundButton() as HTMLButtonElement).disabled).toBe(true);
    });

    it('keeps the dialog open and shows a refusal in plain words', async () => {
        refundSubscriptionByAdmin.mockImplementation(() =>
            Promise.reject({ response: { status: 409, data: '409 CONFLICT - nothing to refund' } })
        );
        renderPanel('d1');

        fireEvent.click(refundButton());
        fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'r' } });
        fireEvent.click(screen.getByRole('button', { name: 'Refund' }));

        await waitFor(() => expect(screen.getByText(/No paid charge to refund/)).toBeTruthy());
        expect(screen.getByRole('alertdialog')).toBeTruthy();
    });
});

describe('MembershipDetailPanel refund section', () => {
    const renderDetail = (over: Record<string, unknown>) =>
        withClient(
            <MembershipDetailPanel
                membership={membership(over)}
                onClose={vi.fn()}
                onUpdated={vi.fn()}
                now={Date.now()}
                stage="d1"
            />
        );

    it('appears for a web subscription', () => {
        renderDetail({});
        expect(screen.getByText('Web subscription refund')).toBeTruthy();
    });

    // Closing the drawer under an open confirmation would unmount a panel whose refund may be in flight.
    it('leaves Escape to an open confirmation instead of closing the drawer', () => {
        const onClose = vi.fn();
        withClient(
            <MembershipDetailPanel
                membership={membership()}
                onClose={onClose}
                onUpdated={vi.fn()}
                now={Date.now()}
                stage="d1"
            />
        );

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Refund web subscription' }));
        expect(screen.getByRole('alertdialog')).toBeTruthy();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('is absent for a store subscription', () => {
        renderDetail({ platform: 'apple' });
        expect(screen.queryByText('Web subscription refund')).toBeNull();
    });
});
