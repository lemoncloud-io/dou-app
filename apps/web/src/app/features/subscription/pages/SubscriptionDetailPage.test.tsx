import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { SubscriptionDetailPage } from './SubscriptionDetailPage';
import { usePlanCatalog, usePlanPrice } from '../hooks';
import { useClouds } from '../../../hooks/useCloudCatalog';
import { useMembershipInfo } from '../../../hooks/useMembership';
import { appBridge } from '../../../bridge';
import { ROUTES } from '../../../routes/paths';
import { useRestoredSignal } from '../stores/useRestoredSignal';
import type { SubscriptionSummary } from '../lib';

// Echo the key, plus the values a scenario cares about, so assertions can name both.
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts && 'days' in opts ? `${key}:${opts.days}` : key),
        i18n: { language: 'ko' },
    }),
}));

let mockNative = true;
jest.mock('@chatic/bridges', () => ({ ...jest.requireActual('@chatic/bridges'), isNative: () => mockNative }));

const navigateMock = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigateMock,
}));
jest.mock('react-router-dom', () => ({
    Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));
jest.mock('../../../bridge', () => ({ appBridge: { openSubscriptionManagement: jest.fn() } }));
jest.mock('../hooks', () => ({ usePlanCatalog: jest.fn(), usePlanPrice: jest.fn() }));
jest.mock('../../../hooks/useCloudCatalog', () => ({ useClouds: jest.fn() }));
jest.mock('../../../hooks/useMembership', () => ({ useMembershipInfo: jest.fn() }));

const DAY = 86_400_000;
const NOW = 1_790_000_000_000;

const tier1 = { id: '#pro-tier-01', name: 'DoU Cloud 1', sort: 1, maxClouds: 1 };
const tier2 = { id: '#pro-tier-02', name: 'DoU Cloud 2', sort: 2, maxClouds: 2 };

interface Scene {
    summary: Partial<SubscriptionSummary>;
    membership?: Record<string, unknown>;
    clouds?: unknown[];
    price?: string;
    isOtherStore?: boolean;
}

const cloud = (id: string, plan?: 'drop') => ({
    id,
    name: id,
    status: 'active',
    state$: { provision: 'active', ...(plan && { plan }) },
});

const show = ({ summary, membership = {}, clouds = [], price = '₩17,600', isOtherStore = false }: Scene) => {
    const full: SubscriptionSummary = {
        state: 'active',
        isEntitled: true,
        hasLiveReceipt: true,
        productId: tier2.id,
        validUntil: NOW + 10 * DAY,
        ...summary,
    };
    (useMembershipInfo as jest.Mock).mockReturnValue({
        data: {
            platform: 'apple',
            validFrom: NOW - 20 * DAY,
            validUntil: full.validUntil,
            autoRenewing: true,
            ...membership,
        },
        isLoading: false,
    });
    (usePlanCatalog as jest.Mock).mockReturnValue({
        summary: full,
        currentPlan: tier2,
        pendingPlan: full.pendingProductId ? tier1 : undefined,
        isIOS: true,
        isOtherStore,
    });
    (usePlanPrice as jest.Mock).mockReturnValue(() => (mockNative ? price : undefined));
    (useClouds as jest.Mock).mockReturnValue({ data: { list: clouds } });
    return render(<SubscriptionDetailPage />);
};

const K = 'mypage.subscription';

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNative = true;
    useRestoredSignal.setState({ lastState: undefined, restored: false });
});

afterEach(() => jest.restoreAllMocks());

describe('Subscription detail — scenarios', () => {
    it('sends someone with no subscription back to the list', () => {
        show({ summary: { state: 'none', isEntitled: false, hasLiveReceipt: false } });

        expect(screen.getByTestId('redirect')).toHaveTextContent(ROUTES.subscription.root);
    });

    it('active: reminds of the next charge, lists the next payment, and the banner opens the store', () => {
        show({ summary: {} });

        expect(screen.getByText(`${K}.banner.autoRenew.title`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.info.nextPayment`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.info.scheduledPrice`)).toBeInTheDocument();
        expect(screen.queryByText(`${K}.info.endsOn`)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${K}.banner.autoRenew.title`) }));
        expect(appBridge.openSubscriptionManagement).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: `${K}.detail.changePlan` }));
        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.plans);
    });

    it('scheduled cancellation: ending banner with a day countdown and the end date row', () => {
        show({ summary: { state: 'cancelScheduled', validUntil: NOW + 3 * DAY } });

        expect(screen.getByText(`${K}.banner.ending.title`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.banner.ending.chip:3`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.info.endsOn`)).toBeInTheDocument();
        expect(screen.queryByText(`${K}.info.nextPayment`)).not.toBeInTheDocument();
        // The plan itself is still running — only the status row says it is ending.
        expect(screen.getByText(`${K}.state.active`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.state.ending`)).toBeInTheDocument();
    });

    it('expired within the hold: promises the old clouds back and offers to subscribe again', () => {
        show({ summary: { state: 'expired', isEntitled: false, hasLiveReceipt: false, validUntil: NOW - 5 * DAY } });

        expect(screen.getByText(`${K}.banner.expired.description`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.info.expiredOn`)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: `${K}.detail.resubscribe` }));
        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.plans);
    });

    it('expired past the hold: no longer promises the old clouds', () => {
        show({ summary: { state: 'expired', isEntitled: false, hasLiveReceipt: false, validUntil: NOW - 40 * DAY } });

        expect(screen.getByText(`${K}.banner.expired.descriptionPastHold`)).toBeInTheDocument();
        expect(screen.queryByText(`${K}.banner.expired.description`)).not.toBeInTheDocument();
    });

    it('restored within the session: shows the restored note once', () => {
        act(() => useRestoredSignal.getState().observe('cancelScheduled'));
        show({ summary: {} });

        expect(screen.getByText(`${K}.banner.restored.title`)).toBeInTheDocument();
        expect(screen.queryByText(`${K}.banner.autoRenew.title`)).not.toBeInTheDocument();
    });

    it('blocked: the block banner, and no way to change plan', () => {
        show({ summary: { state: 'blocked', isEntitled: false, isAdminOverridden: true } });

        expect(screen.getByText(`${K}.banner.blocked.title`)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: `${K}.detail.changePlan` })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: `${K}.detail.manageInStore` })).toBeInTheDocument();
        expect(screen.getByText(`${K}.info.adminGrant`)).toBeInTheDocument();
    });

    it('queued downgrade over the allowance: the pending card asks to choose clouds', () => {
        show({ summary: { pendingProductId: tier1.id }, clouds: [cloud('a'), cloud('b')] });

        expect(screen.getByText(`${K}.detail.pendingTitle`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.state.scheduled`)).toBeInTheDocument();
        // A queued change hides the renewal reminder — the pending card states the next charge.
        expect(screen.queryByText(`${K}.banner.autoRenew.title`)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: `${K}.detail.keepPick` }));
        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.keep);
    });

    it('queued downgrade with a choice already sent: offers to review it', () => {
        show({ summary: { pendingProductId: tier1.id }, clouds: [cloud('a'), cloud('b', 'drop')] });

        expect(screen.getByRole('button', { name: `${K}.detail.keepReview` })).toBeInTheDocument();
    });

    it('queued downgrade that already fits: nothing to choose', () => {
        show({ summary: { pendingProductId: tier1.id }, clouds: [cloud('a')] });

        expect(screen.queryByRole('button', { name: `${K}.detail.keepPick` })).not.toBeInTheDocument();
    });

    it('bought on the other store: says where to change it, and offers nothing that would open this store', () => {
        show({
            summary: { state: 'cancelScheduled', validUntil: NOW + 3 * DAY },
            membership: { platform: 'google' },
            isOtherStore: true,
        });

        expect(screen.getByText(`${K}.detail.otherStore`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.banner.ending.title`)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: new RegExp(`${K}.banner.ending.title`) })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: `${K}.detail.changePlan` })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: `${K}.detail.manageInStore` })).not.toBeInTheDocument();
        expect(screen.getByText(`${K}.notice.manageAt.google`)).toBeInTheDocument();
    });

    it('free trial: shows the days left', () => {
        show({ summary: { trialDaysLeft: 4 } });

        expect(screen.getByText(`${K}.trialRemaining:4`)).toBeInTheDocument();
    });

    it('web: no price, no banner, no store buttons', () => {
        mockNative = false;
        show({ summary: {} });

        expect(screen.getByText(`${K}.mobileOnly`)).toBeInTheDocument();
        expect(screen.queryByText(`${K}.banner.autoRenew.title`)).not.toBeInTheDocument();
        expect(screen.queryByText(`${K}.info.price`)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: `${K}.detail.manageInStore` })).not.toBeInTheDocument();
    });
});
