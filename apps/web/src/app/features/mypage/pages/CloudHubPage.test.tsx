import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { CloudHubPage } from './CloudHubPage';

const navigate = jest.fn();
let clouds: Partial<CloudView>[] = [];
let hasCloudCatalog = true;

jest.mock('react-router-dom', () => ({ useParams: () => ({ cloudId: 'CL1' }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../../hooks/useCachedCloudNames', () => ({ useCachedCloudNames: () => ({}) }));
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds, hasCloudCatalog }),
}));

const toast = jest.fn();
const retryCloudSetup = jest.fn();
let isRetryPending = false;
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('../hooks/useRetryCloudSetup', () => ({
    useRetryCloudSetup: () => ({ mutateAsync: retryCloudSetup, isPending: isRetryPending }),
}));

const K = 'mypage.cloudManage.hub';

beforeEach(() => {
    jest.clearAllMocks();
    clouds = [{ id: 'CL1', name: 'Lemon', status: 'active' }];
    hasCloudCatalog = true;
    isRetryPending = false;
});

describe('CloudHubPage', () => {
    it('offers all three screens for a live cloud', () => {
        render(<CloudHubPage />);

        fireEvent.click(screen.getByText(`${K}.profile`));
        fireEvent.click(screen.getByText(`${K}.detail`));
        fireEvent.click(screen.getByText(`${K}.places`));

        expect(navigate.mock.calls.map(call => call[0])).toEqual([
            '/mypage/cloud-manage/CL1/edit',
            '/mypage/cloud-manage/CL1/detail',
            '/mypage/cloud-manage/CL1/places',
        ]);
        expect(screen.queryByText(`${K}.notEnterable`)).not.toBeInTheDocument();
    });

    it.each([['reserved'], ['error'], ['suspended']] as const)(
        'keeps only the information row open for a cloud with no session (status %s)',
        status => {
            clouds = [{ id: 'CL1', name: 'Lemon', status }];

            render(<CloudHubPage />);

            expect(screen.getAllByText(`${K}.notEnterable`)).toHaveLength(2);
            fireEvent.click(screen.getByText(`${K}.profile`));
            fireEvent.click(screen.getByText(`${K}.places`));
            expect(navigate).not.toHaveBeenCalled();
            fireEvent.click(screen.getByText(`${K}.detail`));
            expect(navigate).toHaveBeenCalledWith('/mypage/cloud-manage/CL1/detail');
        }
    );

    it('leaves for the list once the catalog says the cloud is not mine', () => {
        clouds = [];

        render(<CloudHubPage />);

        expect(navigate).toHaveBeenCalledWith('/mypage/cloud-manage', { replace: true });
    });

    it('waits while the catalog is still pending', () => {
        clouds = [];
        hasCloudCatalog = false;

        render(<CloudHubPage />);

        expect(navigate).not.toHaveBeenCalled();
    });

    describe('retrying a failed setup', () => {
        it.each([['active'], ['reserved'], ['init'], ['suspended']] as const)(
            'offers no retry for a cloud whose setup did not fail (status %s)',
            status => {
                clouds = [{ id: 'CL1', name: 'Lemon', status }];

                render(<CloudHubPage />);

                expect(screen.queryByText(`${K}.retry`)).not.toBeInTheDocument();
            }
        );

        it('retries a failed cloud and says it started again', async () => {
            clouds = [{ id: 'CL1', name: 'Lemon', status: 'error' }];
            retryCloudSetup.mockResolvedValue({ id: 'CL1', status: 'reserved' });

            render(<CloudHubPage />);
            fireEvent.click(screen.getByText(`${K}.retry`));

            await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: `${K}.retrySuccess` }));
            expect(retryCloudSetup).toHaveBeenCalledWith({ id: 'CL1' });
            expect(navigate).not.toHaveBeenCalled();
        });

        it('shows the failure toast when the relay refuses', async () => {
            clouds = [{ id: 'CL1', name: 'Lemon', status: 'error' }];
            retryCloudSetup.mockRejectedValue(new Error('.slotId[9] is already assigned'));

            render(<CloudHubPage />);
            fireEvent.click(screen.getByText(`${K}.retry`));

            await waitFor(() =>
                expect(toast).toHaveBeenCalledWith({ title: `${K}.retryFailed`, variant: 'destructive' })
            );
        });

        // The relay refuses a cloud that failed after its workspace slot was assigned.
        it.each([[{ slotId: 'S9' }], [{ accountNo: '123' }]])('offers no retry once a slot is held (%o)', slot => {
            clouds = [{ id: 'CL1', name: 'Lemon', status: 'error', ...slot }];

            render(<CloudHubPage />);

            expect(screen.queryByText(`${K}.retry`)).not.toBeInTheDocument();
        });

        it('holds the row while a retry is in flight', () => {
            clouds = [{ id: 'CL1', name: 'Lemon', status: 'error' }];
            isRetryPending = true;

            render(<CloudHubPage />);
            fireEvent.click(screen.getByText(`${K}.retry`));

            expect(retryCloudSetup).not.toHaveBeenCalled();
        });
    });
});
