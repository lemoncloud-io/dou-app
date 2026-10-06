import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SubscriptionConfirmPage } from './SubscriptionConfirmPage';
import { usePlanCatalog, usePlanOptions, usePlanPrice, useRestorePurchases, useTierPurchase } from '../hooks';
import { useClouds } from '../../../hooks/useCloudCatalog';
import { useMembershipInfo } from '../../../hooks/useMembership';
import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { ROUTES } from '../../../routes/paths';
import { PageState } from '../types';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts && 'days' in opts ? `${key}:${opts.days}` : key),
        i18n: { language: 'ko' },
    }),
}));
jest.mock('@chatic/bridges', () => ({ ...jest.requireActual('@chatic/bridges'), logger: { warn: jest.fn() } }));

const navigateMock = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigateMock,
}));
const toastMock = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

let mockParams = new URLSearchParams();
jest.mock('react-router-dom', () => ({
    useSearchParams: () => [mockParams],
    Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));
jest.mock('../../../bridge', () => ({ appBridge: { openURL: jest.fn() } }));
jest.mock('../consts', () => ({ POLICY_BASE_URL: 'https://policy.example' }));
jest.mock('../hooks', () => ({
    usePlanCatalog: jest.fn(),
    usePlanOptions: jest.fn(),
    usePlanPrice: jest.fn(),
    useRestorePurchases: jest.fn(),
    useTierPurchase: jest.fn(),
}));
jest.mock('../../../hooks/useCloudCatalog', () => ({ useClouds: jest.fn() }));
jest.mock('../../../hooks/useMembership', () => ({ useMembershipInfo: jest.fn() }));
// The policy footer reaches the restore hook on its own; it is covered where it lives.
jest.mock('../components/subscription-select/PolicyFooter', () => ({ PolicyFooter: () => null }));

const tier1 = { id: '#pro-tier-01', name: 'DoU Cloud 1', sort: 1, maxClouds: 1, trialDays: 7 };
const tier2 = { id: '#pro-tier-02', name: 'DoU Cloud 2', sort: 2, maxClouds: 2, trialDays: 0 };

const resolveNativeProduct = jest.fn().mockResolvedValue({ id: 'native' });
const purchaseTier = jest.fn();
const restoreMock = jest.fn();

const show = ({
    plan,
    kind,
    state = 'active',
    current,
    price = '₩8,800',
    isIOS = true,
    clouds = [],
}: {
    plan: typeof tier1;
    kind: string;
    state?: string;
    current?: typeof tier1;
    price?: string;
    isIOS?: boolean;
    clouds?: unknown[];
}) => {
    mockParams = new URLSearchParams({ plan: plan.id });
    (usePlanCatalog as jest.Mock).mockReturnValue({
        summary: { state },
        replaceablePlan: current,
        isIOS,
        isOnMobileApp: true,
    });
    (usePlanOptions as jest.Mock).mockReturnValue({
        options: [{ plan, kind, isSelectable: kind !== 'blocked', isCurrent: false, displayPrice: price }],
        isLoading: false,
    });
    (usePlanPrice as jest.Mock).mockReturnValue(() => '₩17,600');
    (useRestorePurchases as jest.Mock).mockReturnValue({ restore: restoreMock });
    (useTierPurchase as jest.Mock).mockReturnValue({
        pageState: PageState.Idle,
        isBlocked: false,
        resolveNativeProduct,
        purchaseTier,
    });
    (useClouds as jest.Mock).mockReturnValue({ data: { list: clouds } });
    (useMembershipInfo as jest.Mock).mockReturnValue({ data: { validFrom: 1, validUntil: 2, platform: 'apple' } });
    render(<SubscriptionConfirmPage />);
};

const K = 'mypage.subscription';
const membership = { validFrom: 1, validUntil: 2, platform: 'apple', isValid: true };
const cloud = (id: string) => ({ id, name: id, status: 'active' });

beforeEach(() => {
    jest.clearAllMocks();
    useAddCloudRequest.setState({ isOpen: false });
});

describe('Subscription confirm — scenarios', () => {
    it('first subscription with a trial: offers the trial and buys through the store', async () => {
        purchaseTier.mockResolvedValueOnce(membership);
        show({ plan: tier1, kind: 'new', state: 'none' });

        fireEvent.click(screen.getByRole('button', { name: `${K}.cloudGuide.ctaWithTrial:7` }));

        await waitFor(() => expect(purchaseTier).toHaveBeenCalledWith(tier1, { id: 'native' }));
        expect(await screen.findByRole('dialog', { name: `${K}.done.newTitle` })).toBeInTheDocument();
        expect(screen.getByText(`${K}.info.trialEndsOn`)).toBeInTheDocument();
    });

    it('upgrade on iOS: current against new, Apple refund wording, and the next step is a new cloud', async () => {
        purchaseTier.mockResolvedValueOnce(membership);
        show({ plan: tier2, kind: 'upgrade', current: tier1, price: '₩17,600' });

        expect(screen.getByText(`${K}.info.current`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.info.next`)).toBeInTheDocument();
        expect(screen.getAllByText(`${K}.confirm.upgradeApple1`).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: `${K}.subscribe` }));
        fireEvent.click(await screen.findByRole('button', { name: `${K}.done.addCloud` }));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.detail, { replace: true });
        expect(useAddCloudRequest.getState().isOpen).toBe(true);
    });

    it('upgrade on Android: says only the difference is charged', () => {
        show({ plan: tier2, kind: 'upgrade', current: tier1, isIOS: false });

        expect(screen.getByText(`${K}.confirm.upgradeGoogle1`)).toBeInTheDocument();
        expect(screen.queryByText(`${K}.confirm.upgradeApple1`)).not.toBeInTheDocument();
    });

    it('downgrade over the allowance: reserve, then go choose the clouds to keep', async () => {
        purchaseTier.mockResolvedValueOnce({ ...membership, pendingProductId: tier1.id });
        show({ plan: tier1, kind: 'downgrade', current: tier2, clouds: [cloud('a'), cloud('b')] });

        expect(screen.getByText(`${K}.confirm.downgradeHeadline`)).toBeInTheDocument();
        expect(screen.getByText(`${K}.info.applyOn`)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: `${K}.confirm.reserve` }));
        expect(await screen.findByText(`${K}.state.scheduled`)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: `${K}.detail.keepPick` }));

        expect(navigateMock).toHaveBeenCalledWith(`${ROUTES.subscription.keep}?plan=${encodeURIComponent(tier1.id)}`, {
            replace: true,
        });
    });

    it('downgrade that fits: the completion has nothing to choose', async () => {
        purchaseTier.mockResolvedValueOnce(membership);
        show({ plan: tier1, kind: 'downgrade', current: tier2, clouds: [cloud('a')] });

        fireEvent.click(screen.getByRole('button', { name: `${K}.confirm.reserve` }));
        await screen.findByText(`${K}.state.scheduled`);

        expect(screen.queryByRole('button', { name: `${K}.detail.keepPick` })).not.toBeInTheDocument();
    });

    it('a cancelled store sheet says nothing and stays put', async () => {
        purchaseTier.mockRejectedValueOnce({ code: 'user-cancelled' });
        show({ plan: tier2, kind: 'upgrade', current: tier1 });

        fireEvent.click(screen.getByRole('button', { name: `${K}.subscribe` }));

        await waitFor(() => expect(purchaseTier).toHaveBeenCalled());
        expect(toastMock).not.toHaveBeenCalled();
        expect(screen.queryByText(`${K}.done.changedTitle`)).not.toBeInTheDocument();
    });

    it('an already-owned purchase is recovered, not reported as a failure', async () => {
        purchaseTier.mockRejectedValueOnce({ code: 'already-owned' });
        show({ plan: tier2, kind: 'upgrade', current: tier1 });

        fireEvent.click(screen.getByRole('button', { name: `${K}.subscribe` }));

        await waitFor(() => expect(restoreMock).toHaveBeenCalled());
        expect(toastMock).not.toHaveBeenCalled();
    });

    it('a failed purchase is reported', async () => {
        purchaseTier.mockRejectedValueOnce(new Error('boom'));
        show({ plan: tier2, kind: 'upgrade', current: tier1 });

        fireEvent.click(screen.getByRole('button', { name: `${K}.subscribe` }));

        await waitFor(() =>
            expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: `${K}.purchaseFailed` }))
        );
    });

    it('no store price: explains and does not let the purchase start', () => {
        show({ plan: tier2, kind: 'upgrade', current: tier1, price: '' });

        expect(screen.getByText(`${K}.confirm.unavailable`)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: `${K}.subscribe` })).toBeDisabled();
    });

    it('a plan the rules refuse goes back to the picker', () => {
        show({ plan: tier2, kind: 'blocked', current: undefined });

        expect(screen.getByTestId('redirect')).toHaveTextContent(ROUTES.subscription.plans);
    });
});
