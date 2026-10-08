import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { logger } from '@chatic/bridges';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { CloudDetailPage } from './CloudDetailPage';

const navigate = jest.fn();
const mockDeleteCloud = jest.fn();
const logoutCloudSession = jest.fn();
const setQueriesData = jest.fn();
let clouds: Partial<CloudView>[] = [];
let hasCloudCatalog = true;
let selectedCloudId = 'default';

jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { cloudsKeys: { lists: () => ['clouds', 'list'] } },
        session: { useSessionSelection: () => ({ selectedCloudId }) },
    },
}));
jest.mock('react-router-dom', () => ({ useParams: () => ({ cloudId: 'CL2' }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueriesData }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
// The app barrel behind `PageHeader` drags the runtime in; the header is a title here.
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ko' } }),
}));
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds, hasCloudCatalog }),
}));
jest.mock('../hooks/useDeleteCloud', () => ({
    useDeleteCloud: () => ({ mutateAsync: mockDeleteCloud, isPending: false }),
}));
jest.mock('../../../runtime/useLogoutCloudSession', () => ({
    useLogoutCloudSession: () => ({ logoutCloudSession }),
}));

const K = 'mypage.cloudManage';
const cloud = { id: 'CL2', name: '작업용', email: 'b@example.com', status: 'active', createdAt: 1_700_000_000_000 };

/** Opens the confirm dialog from the destructive row and presses its confirm button. */
const releaseCloud = () => {
    fireEvent.click(screen.getByText(`${K}.delete`));
    // The row keeps its label while the dialog is open; the dialog's confirm is the second one.
    fireEvent.click(screen.getAllByText(`${K}.delete`)[1]);
};

beforeEach(() => {
    jest.clearAllMocks();
    clouds = [cloud];
    hasCloudCatalog = true;
    selectedCloudId = 'default';
    mockDeleteCloud.mockResolvedValue(undefined);
    logoutCloudSession.mockResolvedValue(undefined);
});

describe('CloudDetailPage — the facts', () => {
    it('shows name, linked account and the status word', () => {
        render(<CloudDetailPage />);

        expect(screen.getAllByText('작업용').length).toBeGreaterThan(0);
        expect(screen.getByText('b@example.com')).toBeInTheDocument();
        expect(screen.getByText(`${K}.status.subscribed`)).toBeInTheDocument();
    });

    it('draws a dash for a missing linked account — its absence is the fact', () => {
        clouds = [{ ...cloud, email: undefined }];

        render(<CloudDetailPage />);

        expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('leaves out the created date when the relay did not send one', () => {
        clouds = [{ ...cloud, createdAt: undefined }];

        render(<CloudDetailPage />);

        expect(screen.queryByText(`${K}.detail.createdAtLabel`)).not.toBeInTheDocument();
    });

    it('leaves for the list once the catalog says the cloud is not mine', () => {
        clouds = [];

        render(<CloudDetailPage />);

        expect(navigate).toHaveBeenCalledWith('/mypage/cloud-manage', { replace: true });
    });

    it('does not judge ownership while the catalog is still pending', () => {
        clouds = [];
        hasCloudCatalog = false;

        render(<CloudDetailPage />);

        expect(navigate).not.toHaveBeenCalled();
    });
});

describe('CloudDetailPage — releasing', () => {
    it('releases with cascade, patches the catalog, logs and returns to the list', async () => {
        render(<CloudDetailPage />);
        releaseCloud();

        await waitFor(() => expect(mockDeleteCloud).toHaveBeenCalledWith({ id: 'CL2', cascade: true }));
        await waitFor(() =>
            expect(logger.info).toHaveBeenCalledWith('CLOUD', 'cloud released', { cloudId: 'CL2', wasActive: false })
        );
        expect(setQueriesData).toHaveBeenCalled();
        // Once, from the release itself — not a second time from the not-mine redirect, which
        // the emptied catalog would otherwise trigger mid-release.
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/mypage/cloud-manage', { replace: true });
        expect(logoutCloudSession).not.toHaveBeenCalled();
    });

    it('ends the cloud session when the released cloud was the active one', async () => {
        selectedCloudId = 'CL2';

        render(<CloudDetailPage />);
        fireEvent.click(screen.getByText(`${K}.delete`));
        // The confirm names the consequence before the irreversible step.
        expect(screen.getByText(/deleteSelectedCloudWarning/)).toBeInTheDocument();
        fireEvent.click(screen.getAllByText(`${K}.delete`)[1]);

        await waitFor(() => expect(logoutCloudSession).toHaveBeenCalledTimes(1));
        expect(logger.info).toHaveBeenCalledWith('CLOUD', 'cloud released', { cloudId: 'CL2', wasActive: true });
        // The reload replaces the list; nothing navigates there first.
        expect(navigate).not.toHaveBeenCalled();
    });

    it('records a failed release — it is irreversible and cascades', async () => {
        const boom = new Error('release boom');
        mockDeleteCloud.mockRejectedValueOnce(boom);

        render(<CloudDetailPage />);
        releaseCloud();

        await waitFor(() =>
            expect(logger.error).toHaveBeenCalledWith('CLOUD', 'cloud release failed', {
                error: boom,
                data: { cloudId: 'CL2' },
            })
        );
        expect(navigate).not.toHaveBeenCalledWith('/mypage/cloud-manage', { replace: true });
    });
});
