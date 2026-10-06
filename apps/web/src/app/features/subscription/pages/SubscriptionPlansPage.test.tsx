import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { SubscriptionPlansPage } from './SubscriptionPlansPage';
import { usePlanCatalog, usePlanOptions } from '../hooks';
import { ROUTES } from '../../../routes/paths';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts && 'days' in opts ? `${key}:${opts.days}` : key),
        i18n: { language: 'ko' },
    }),
}));

let mockGuest = false;
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
jest.mock('../../../bridge', () => ({ appBridge: { openURL: jest.fn() } }));
jest.mock('../consts', () => ({ POLICY_BASE_URL: 'https://policy.example' }));
jest.mock('../components/subscription-select/PolicyFooter', () => ({ PolicyFooter: () => null }));
jest.mock('../hooks', () => ({ usePlanCatalog: jest.fn(), usePlanOptions: jest.fn() }));

const tier1 = { id: '#pro-tier-01', name: 'DoU Cloud 1', sort: 1, maxClouds: 1, trialDays: 7 };
const tier2 = { id: '#pro-tier-02', name: 'DoU Cloud 2', sort: 2, maxClouds: 2, trialDays: 0 };
const tier3 = { id: '#pro-tier-03', name: 'DoU Cloud 3', sort: 3, maxClouds: 3, trialDays: 0 };

const option = (plan: typeof tier1, kind: string, extra: Record<string, unknown> = {}) => ({
    plan,
    kind,
    isSelectable: kind === 'new' || kind === 'upgrade' || kind === 'downgrade',
    isCurrent: kind === 'current',
    displayPrice: '₩8,800',
    ...extra,
});

const show = ({ state, current, options }: { state: string; current?: typeof tier1; options: unknown[] }) => {
    (usePlanCatalog as jest.Mock).mockReturnValue({
        sellablePlans: [tier1, tier2, tier3],
        summary: { state, isEntitled: state !== 'none' },
        currentPlan: current,
        isOnMobileApp: true,
        isIOS: true,
    });
    (usePlanOptions as jest.Mock).mockReturnValue({ options, isLoading: false });
    render(<SubscriptionPlansPage />);
};

const K = 'mypage.subscription';

beforeEach(() => {
    jest.clearAllMocks();
    mockGuest = false;
});

describe('Subscription picker — scenarios', () => {
    it('first subscription: only the entry tier is pickable, with its trial; continue opens the confirm step', () => {
        show({
            state: 'none',
            options: [option(tier1, 'new'), option(tier2, 'blocked', { refusal: 'entryTier', disabledReason: 'x' })],
        });

        expect(screen.queryByText(`${K}.currentPlan`)).not.toBeInTheDocument();
        expect(screen.getByText(`${K}.trialBadge:7`)).toBeInTheDocument();

        const next = screen.getByRole('button', { name: `${K}.picker.next` });
        expect(next).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /DoU Cloud 1/ }));
        fireEvent.click(next);

        expect(navigateMock).toHaveBeenCalledWith(
            `${ROUTES.subscription.confirm}?plan=${encodeURIComponent(tier1.id)}`
        );
    });

    it('subscribed to tier 2: shows the current plan, and both neighbours are pickable', () => {
        show({
            state: 'active',
            current: tier2,
            options: [
                option(tier1, 'downgrade'),
                option(tier2, 'current', { refusal: 'current' }),
                option(tier3, 'upgrade'),
            ],
        });

        expect(screen.getByText(`${K}.currentPlan`)).toBeInTheDocument();
        expect(screen.queryByText(`${K}.trialBadge:7`)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /DoU Cloud 3/ }));
        fireEvent.click(screen.getByRole('button', { name: `${K}.picker.next` }));
        expect(navigateMock).toHaveBeenCalledWith(
            `${ROUTES.subscription.confirm}?plan=${encodeURIComponent(tier3.id)}`
        );
    });

    it('a refused tier explains itself instead of being picked', () => {
        show({
            state: 'active',
            current: tier1,
            options: [
                option(tier1, 'current', { refusal: 'current' }),
                option(tier3, 'blocked', { refusal: 'tierJump', disabledReason: 'x' }),
            ],
        });

        fireEvent.click(screen.getByRole('button', { name: /DoU Cloud 3/ }));

        expect(screen.getByText(`${K}.refusal.tierJump.title`)).toBeInTheDocument();
        // The dialog hides the page behind it from the accessibility tree; the button is still off.
        expect(screen.getByRole('button', { name: `${K}.picker.next`, hidden: true })).toBeDisabled();
    });

    it('guest: asks to log in before leaving for the confirm step', () => {
        mockGuest = true;
        show({ state: 'none', options: [option(tier1, 'new')] });

        fireEvent.click(screen.getByRole('button', { name: /DoU Cloud 1/ }));
        fireEvent.click(screen.getByRole('button', { name: `${K}.picker.next` }));

        expect(navigateMock).not.toHaveBeenCalled();
        expect(screen.getByText(`${K}.loginRequiredTitle`)).toBeInTheDocument();
    });
});
