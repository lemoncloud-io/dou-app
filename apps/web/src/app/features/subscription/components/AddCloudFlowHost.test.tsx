import '@testing-library/jest-dom';

import { StrictMode } from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
const addCloudMock = jest.fn();
jest.mock('../hooks', () => ({
    useAddCloud: () => addCloudMock,
    useCloudQuota: jest.fn(),
    usePlanCatalog: jest.fn(),
}));

const tier = (sort: number) => ({ id: `#pro-tier-0${sort}`, sort, maxClouds: sort });
const tiers = [1, 2, 3, 4, 5].map(tier);

const open = (quota: Record<string, unknown>, currentPlan = tier(5), sellablePlans: unknown[] = tiers) => {
    (useCloudQuota as jest.Mock).mockReturnValue({ used: 0, limit: null, isLoading: false, ...quota });
    (usePlanCatalog as jest.Mock).mockReturnValue({ currentPlan, catalogPlans: tiers, sellablePlans });
    const view = render(<AddCloudFlowHost />);
    act(() => useAddCloudRequest.getState().requestAddCloud());
    return view;
};

beforeEach(() => {
    jest.clearAllMocks();
    addCloudMock.mockResolvedValue(undefined);
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

describe('AddCloudFlowHost — creating the cloud', () => {
    it('asks the server for the cloud straight away, with no email step — an ending subscription included', async () => {
        open({ used: 1, limit: 3, canAdd: true }, tier(3));

        await waitFor(() => expect(useAddCloudRequest.getState().isOpen).toBe(false));
        expect(addCloudMock).toHaveBeenCalledTimes(1);
        expect(addCloudMock).toHaveBeenCalledWith();
        expect(toastMock).toHaveBeenCalledWith({ title: 'addAccount.success' });
    });

    it('asks once even when the effect runs twice — StrictMode replays mount effects in dev', async () => {
        (useCloudQuota as jest.Mock).mockReturnValue({ used: 1, limit: 3, isLoading: false, canAdd: true });
        (usePlanCatalog as jest.Mock).mockReturnValue({
            currentPlan: tier(3),
            catalogPlans: tiers,
            sellablePlans: tiers,
        });
        act(() => useAddCloudRequest.getState().requestAddCloud());

        render(
            <StrictMode>
                <AddCloudFlowHost />
            </StrictMode>
        );

        await waitFor(() => expect(useAddCloudRequest.getState().isOpen).toBe(false));
        expect(addCloudMock).toHaveBeenCalledTimes(1);
    });

    it('waits for the re-read before asking — the cached verdict may be out of date', async () => {
        const { rerender } = open({ used: 2, limit: 3, canAdd: true, isFetching: true }, tier(3));

        expect(addCloudMock).not.toHaveBeenCalled();

        (useCloudQuota as jest.Mock).mockReturnValue({
            used: 3,
            limit: 3,
            isLoading: false,
            isFetching: false,
            canAdd: false,
            reason: 'limitReached',
        });
        rerender(<AddCloudFlowHost />);

        expect(addCloudMock).not.toHaveBeenCalled();
        expect(screen.getByText('addAccount.limitDialog.title')).toBeInTheDocument();
    });

    it('says the request failed, and still closes', async () => {
        addCloudMock.mockRejectedValue(new Error('409 CONFLICT'));

        open({ used: 1, limit: 3, canAdd: true }, tier(3));

        await waitFor(() => expect(useAddCloudRequest.getState().isOpen).toBe(false));
        expect(toastMock).toHaveBeenCalledWith({ title: 'addAccount.addFailed', variant: 'destructive' });
    });

    it('asks once, and shows no limit dialog when the quota fills up under its own request', async () => {
        let resolveMake: () => void = () => undefined;
        addCloudMock.mockReturnValue(new Promise<void>(resolve => (resolveMake = resolve)));
        const { rerender } = open({ used: 2, limit: 3, canAdd: true }, tier(3));

        (useCloudQuota as jest.Mock).mockReturnValue({
            used: 3,
            limit: 3,
            isLoading: false,
            canAdd: false,
            reason: 'limitReached',
        });
        rerender(<AddCloudFlowHost />);

        expect(screen.queryByText('addAccount.limitDialog.title')).not.toBeInTheDocument();
        expect(screen.queryByText('addAccount.limitDialog.topTitle:3')).not.toBeInTheDocument();

        await act(async () => resolveMake());

        expect(addCloudMock).toHaveBeenCalledTimes(1);
        expect(useAddCloudRequest.getState().isOpen).toBe(false);
    });

    it('says why and closes when the server no longer finds the membership valid', () => {
        open({ used: 0, limit: 3, canAdd: false, reason: 'canceled' }, tier(3));

        expect(toastMock).toHaveBeenCalledWith({ title: 'addAccount.subscriptionCanceled', variant: 'destructive' });
        expect(addCloudMock).not.toHaveBeenCalled();
        expect(useAddCloudRequest.getState().isOpen).toBe(false);
    });
});
