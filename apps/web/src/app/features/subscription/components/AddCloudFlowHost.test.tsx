import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { AddCloudFlowHost } from './AddCloudFlowHost';
import { useCloudQuota, usePlanCatalog } from '../hooks';
import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { ROUTES } from '../../../routes/paths';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts && 'max' in opts ? `${key}:${opts.max}` : key),
    }),
}));
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const navigateMock = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigateMock,
}));
const toastMock = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
jest.mock('../hooks', () => ({
    useAddCloud: () => jest.fn(),
    useCloudEmailGuard: () => jest.fn(),
    useCloudQuota: jest.fn(),
    usePlanCatalog: jest.fn(),
}));
// The verification dialog has its own suite; here only whether the flow reaches it matters.
jest.mock('./EmailVerifyDialog', () => ({
    EmailVerifyDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="email-verify" /> : null),
}));

const tier = (sort: number) => ({ id: `#pro-tier-0${sort}`, sort, maxClouds: sort });
const tiers = [1, 2, 3, 4, 5].map(tier);

const open = (quota: Record<string, unknown>, currentPlan = tier(5), sellablePlans: unknown[] = tiers) => {
    (useCloudQuota as jest.Mock).mockReturnValue({ used: 0, limit: null, isLoading: false, ...quota });
    (usePlanCatalog as jest.Mock).mockReturnValue({ currentPlan, catalogPlans: tiers, sellablePlans });
    render(<AddCloudFlowHost />);
    act(() => useAddCloudRequest.getState().requestAddCloud());
};

beforeEach(() => {
    jest.clearAllMocks();
    act(() => useAddCloudRequest.getState().closeAddCloud());
});

describe('AddCloudFlowHost — a used-up allowance', () => {
    it('states the ceiling at the top tier and leads to the subscription list', () => {
        open({ used: 5, limit: 5, canAdd: false, reason: 'limitReached' });

        expect(screen.getByText('addAccount.limitDialog.topTitle:5')).toBeInTheDocument();
        expect(screen.getByText('addAccount.limitDialog.topDescription')).toBeInTheDocument();
        expect(screen.getByText('common.cancel')).toBeInTheDocument();

        fireEvent.click(screen.getByText('addAccount.limitDialog.manageSubscription'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.root);
        expect(useAddCloudRequest.getState().isOpen).toBe(false);
    });

    it('still offers a plan change below the top tier', () => {
        open({ used: 2, limit: 2, canAdd: false, reason: 'limitReached' }, tier(2));

        expect(screen.getByText('addAccount.limitDialog.title')).toBeInTheDocument();
        expect(screen.queryByText('addAccount.limitDialog.manageSubscription')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('addAccount.limitDialog.changePlan'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.plans);
    });

    it('offers a plan change off-native too, where nothing is sellable — the ceiling is the catalog’s', () => {
        open({ used: 1, limit: 1, canAdd: false, reason: 'limitReached' }, tier(1), []);

        expect(screen.getByText('addAccount.limitDialog.changePlan')).toBeInTheDocument();
        expect(screen.queryByText('addAccount.limitDialog.topTitle:1')).not.toBeInTheDocument();
    });

    it('closes on cancel without going anywhere', () => {
        open({ used: 5, limit: 5, canAdd: false, reason: 'limitReached' });

        fireEvent.click(screen.getByText('common.cancel'));

        expect(navigateMock).not.toHaveBeenCalled();
        expect(useAddCloudRequest.getState().isOpen).toBe(false);
    });
});

describe('AddCloudFlowHost — the gate before verification', () => {
    it('goes straight to verification when the quota allows it — an ending subscription included', () => {
        open({ used: 1, limit: 3, canAdd: true }, tier(3));

        expect(screen.getByTestId('email-verify')).toBeInTheDocument();
        expect(toastMock).not.toHaveBeenCalled();
    });

    it('says why and closes when the server no longer finds the membership valid', () => {
        open({ used: 0, limit: 3, canAdd: false, reason: 'canceled' }, tier(3));

        expect(toastMock).toHaveBeenCalledWith({ title: 'addAccount.subscriptionCanceled', variant: 'destructive' });
        expect(screen.queryByTestId('email-verify')).not.toBeInTheDocument();
        expect(useAddCloudRequest.getState().isOpen).toBe(false);
    });
});
