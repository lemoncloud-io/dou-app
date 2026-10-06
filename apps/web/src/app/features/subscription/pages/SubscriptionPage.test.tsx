import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { SubscriptionPage } from './SubscriptionPage';
import { usePlanCatalog, usePlanPrice, useRestorePurchases } from '../hooks';
import { useMembershipInfo } from '../../../hooks/useMembership';
import { ROUTES } from '../../../routes/paths';
import type { SubscriptionSummary } from '../lib';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ko' } }),
}));

let mockNative = true;
let mockGuest = false;
jest.mock('@chatic/bridges', () => ({ ...jest.requireActual('@chatic/bridges'), isNative: () => mockNative }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useRuntimeProfile: () => ({ isGuest: mockGuest }) } },
}));

const navigateMock = jest.fn();
const loginMock = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigateMock,
}));
jest.mock('../../auth/hooks', () => ({ useNavigateToLogin: () => loginMock }));
// The two banners run their own queries; their behaviour is tested where they live.
jest.mock('../components', () => ({
    ...jest.requireActual('../components'),
    HeldCloudsBanner: () => null,
    EmailRequiredBanner: () => null,
}));
jest.mock('../hooks', () => ({ usePlanCatalog: jest.fn(), usePlanPrice: jest.fn(), useRestorePurchases: jest.fn() }));
jest.mock('../../../hooks/useMembership', () => ({ useMembershipInfo: jest.fn() }));

const restoreMock = jest.fn();
const tier1 = { id: '#pro-tier-01', name: 'DoU Cloud 1', sort: 1, maxClouds: 1 };
const tier2 = { id: '#pro-tier-02', name: 'DoU Cloud 2', sort: 2, maxClouds: 2 };

const show = (summary: Partial<SubscriptionSummary>, membership: Record<string, unknown> = {}) => {
    const full: SubscriptionSummary = {
        state: 'active',
        isEntitled: true,
        hasLiveReceipt: true,
        productId: tier2.id,
        ...summary,
    };
    (useMembershipInfo as jest.Mock).mockReturnValue({
        data: { validUntil: Date.now() + 864e6, autoRenewing: true, ...membership },
        isLoading: false,
    });
    (usePlanCatalog as jest.Mock).mockReturnValue({
        summary: full,
        currentPlan: full.state === 'none' ? undefined : tier2,
        pendingPlan: full.pendingProductId ? tier1 : undefined,
    });
    (usePlanPrice as jest.Mock).mockReturnValue(() => (mockNative ? '₩17,600' : undefined));
    (useRestorePurchases as jest.Mock).mockReturnValue({
        restore: restoreMock,
        isRestoring: false,
        canRestore: mockNative && !mockGuest,
    });
    render(<SubscriptionPage />);
};

const K = 'mypage.subscription';
const none = { state: 'none' as const, isEntitled: false, hasLiveReceipt: false, productId: undefined };

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
    mockGuest = false;
});

describe('Subscription list — scenarios', () => {
    it('never subscribed: the empty state leads to the cloud guide', () => {
        show(none);

        expect(screen.getByText(`${K}.list.emptyTitle`)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: `${K}.subscribe` }));
        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.guide);
    });

    it('guest: the empty state asks to log in first', () => {
        mockGuest = true;
        show(none);

        expect(screen.getByText(`${K}.loginRequired`)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: `${K}.loginCta` }));
        expect(loginMock).toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: `${K}.restore` })).not.toBeInTheDocument();
    });

    it('web: says subscriptions are app-only and offers nothing to tap', () => {
        mockNative = false;
        show(none);

        expect(screen.getByText(`${K}.mobileOnly`)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: `${K}.subscribe` })).not.toBeInTheDocument();
    });

    it('active: one card with the price and the renewal line, opening the detail', () => {
        show({});

        expect(screen.getByText(`${K}.state.active`)).toBeInTheDocument();
        expect(screen.getByText('₩17,600')).toBeInTheDocument();
        expect(screen.getByText(`${K}.banner.autoRenew.description`)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /DoU Cloud 2/ }));
        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.detail);
    });

    it('queued downgrade: says what it changes to', () => {
        show({ pendingProductId: tier1.id });

        expect(screen.getByText(`${K}.list.changeLine`)).toBeInTheDocument();
    });

    it('scheduled cancellation: gives the last day', () => {
        show({ state: 'cancelScheduled' });
        expect(screen.getByText(`${K}.list.endsLine`)).toBeInTheDocument();
    });

    it('expired: marks the plan expired and gives the expiry date', () => {
        show({ state: 'expired', isEntitled: false, hasLiveReceipt: false });

        expect(screen.getByText(`${K}.state.expired`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.list.expiredLine`)).toBeInTheDocument();
    });

    it('blocked: carries the block notice', () => {
        show({ state: 'blocked', isEntitled: false });

        expect(screen.getByText(`${K}.state.blocked`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.blockedNotice`)).toBeInTheDocument();
    });

    it('restore stays reachable from the list', () => {
        show({});

        fireEvent.click(screen.getByRole('button', { name: `${K}.restore` }));
        expect(restoreMock).toHaveBeenCalled();
    });
});
