import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { KeepCloudsPage } from './KeepCloudsPage';
import { usePlanCatalog } from '../hooks';
import { useClouds } from '../../../hooks/useCloudCatalog';
import { useMarkDrops, useMembershipInfo } from '../../../hooks/useMembership';
import { ROUTES } from '../../../routes/paths';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));

const navigateMock = jest.fn();
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigateMock }));

const toastMock = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

let mockParams = new URLSearchParams();
jest.mock('react-router-dom', () => ({
    useSearchParams: () => [mockParams],
    Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));

jest.mock('../hooks', () => ({ usePlanCatalog: jest.fn() }));
jest.mock('../../../hooks/useCloudCatalog', () => ({ useClouds: jest.fn() }));
jest.mock('../../../hooks/useMembership', () => ({ useMembershipInfo: jest.fn(), useMarkDrops: jest.fn() }));

const mutateAsync = jest.fn().mockResolvedValue({ cloudIds: [], owned: 2 });

const tier1 = { id: '#pro-tier-01', sort: 1, maxClouds: 1 };
const cloud = (id: string, name: string, plan?: 'drop') => ({
    id,
    name,
    status: 'active',
    state$: { provision: 'active', ...(plan && { plan }) },
});

const setup = ({ clouds, pendingPlan = tier1 }: { clouds: unknown[]; pendingPlan?: unknown }) => {
    (usePlanCatalog as jest.Mock).mockReturnValue({ pendingPlan, sellablePlans: [tier1], isLoading: false });
    (useClouds as jest.Mock).mockReturnValue({ data: { list: clouds }, isLoading: false });
    (useMembershipInfo as jest.Mock).mockReturnValue({
        data: { validUntil: Date.now() + 86_400_000 },
        isLoading: false,
    });
    (useMarkDrops as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    render(<KeepCloudsPage />);
};

const confirmLabel = 'common.confirm';

beforeEach(() => {
    jest.clearAllMocks();
    mockParams = new URLSearchParams();
});

describe('KeepCloudsPage', () => {
    it('sends every cloud not kept as the drop list', async () => {
        setup({ clouds: [cloud('a', 'Alpha'), cloud('b', 'Beta')] });

        fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }));
        fireEvent.click(screen.getByRole('button', { name: 'mypage.subscription.keep.confirm' }));
        fireEvent.click(await screen.findByRole('button', { name: confirmLabel }));

        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ cloudIds: ['b'] }));
        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.detail, { replace: true });
        expect(toastMock).toHaveBeenCalledWith({ title: 'mypage.subscription.keep.saved' });
    });

    it('keeps the confirm button off until exactly the allowance is chosen', () => {
        setup({ clouds: [cloud('a', 'Alpha'), cloud('b', 'Beta')] });

        expect(screen.getByRole('button', { name: 'mypage.subscription.keep.confirm' })).toBeDisabled();
    });

    it('opens on the saved choice, offers "change", and stays off until the choice differs', () => {
        setup({ clouds: [cloud('a', 'Alpha'), cloud('b', 'Beta', 'drop')] });

        const change = screen.getByRole('button', { name: 'mypage.subscription.keep.change' });
        expect(screen.getByRole('radio', { name: /Alpha/ })).toHaveAttribute('aria-checked', 'true');
        expect(change).toBeDisabled();

        fireEvent.click(screen.getByRole('radio', { name: /Beta/ }));
        expect(change).toBeEnabled();
    });

    it('goes back to the detail when everything already fits', () => {
        setup({ clouds: [cloud('a', 'Alpha')] });

        expect(screen.getByTestId('redirect')).toHaveTextContent(ROUTES.subscription.detail);
    });

    it('reads the target plan from the link when the membership has not caught up', () => {
        mockParams = new URLSearchParams({ plan: '#pro-tier-01' });
        setup({ clouds: [cloud('a', 'Alpha'), cloud('b', 'Beta')], pendingPlan: undefined });

        expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
        expect(screen.getAllByRole('radio')).toHaveLength(2);
    });

    it('reports a failed save and stays put', async () => {
        mutateAsync.mockRejectedValueOnce(new Error('403'));
        setup({ clouds: [cloud('a', 'Alpha'), cloud('b', 'Beta')] });

        fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }));
        fireEvent.click(screen.getByRole('button', { name: 'mypage.subscription.keep.confirm' }));
        fireEvent.click(await screen.findByRole('button', { name: confirmLabel }));

        await waitFor(() =>
            expect(toastMock).toHaveBeenCalledWith({ title: 'mypage.subscription.keep.failed', variant: 'destructive' })
        );
        expect(navigateMock).not.toHaveBeenCalled();
    });
});
