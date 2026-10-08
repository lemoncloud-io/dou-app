import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { CloudHubPage } from './CloudHubPage';

const navigate = jest.fn();
let clouds: Partial<CloudView>[] = [];
let hasCloudCatalog = true;

jest.mock('react-router-dom', () => ({ useParams: () => ({ cloudId: 'CL1' }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds, hasCloudCatalog }),
}));

const K = 'mypage.cloudManage.hub';

beforeEach(() => {
    jest.clearAllMocks();
    clouds = [{ id: 'CL1', name: 'Lemon', status: 'active' }];
    hasCloudCatalog = true;
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
});
