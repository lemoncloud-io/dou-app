import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { CloudManagePage } from './CloudManagePage';

const navigate = jest.fn();
const requestAddCloud = jest.fn();
let clouds: Partial<CloudView>[] = [];
let scene = { isLoading: false, hasSubscription: true, banner: undefined as string | undefined };
let quota = { used: 0, limit: 2 as number | null };
let onNative = true;

jest.mock('@chatic/bridges', () => ({
    isNative: () => onNative,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
// The app barrel behind `PageHeader` drags the runtime in; the header is a title here.
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds, isPendingClouds: false }),
}));
jest.mock('../../../stores/useAddCloudRequest', () => ({
    useAddCloudRequest: (select: (state: { requestAddCloud: unknown }) => unknown) => select({ requestAddCloud }),
}));
// The subscription's say — banner, plan card, scene, quota — is owned by `features/subscription`;
// this screen only mounts it.
jest.mock('../../subscription', () => ({
    CloudManageBanner: () => <div data-testid="manage-banner" />,
    CurrentPlanCard: () => <div data-testid="plan-card" />,
    useCloudManageScene: () => scene,
    useCloudQuota: () => quota,
}));

const K = 'mypage.cloudManage';

beforeEach(() => {
    jest.clearAllMocks();
    clouds = [];
    scene = { isLoading: false, hasSubscription: true, banner: undefined };
    quota = { used: 0, limit: 2 };
    onNative = true;
});

describe('CloudManagePage — never subscribed', () => {
    beforeEach(() => {
        scene = { ...scene, hasSubscription: false };
    });

    it('shows the empty card with a subscribe button leading to the guide', () => {
        render(<CloudManagePage />);

        expect(screen.getByText('mypage.subscription.list.emptyTitle')).toBeInTheDocument();
        fireEvent.click(screen.getByText('mypage.subscription.subscribe'));
        expect(navigate).toHaveBeenCalledWith('/subscription/guide');
        expect(screen.queryByTestId('plan-card')).not.toBeInTheDocument();
    });

    it('off-native, says a subscription needs the app and offers no button', () => {
        onNative = false;

        render(<CloudManagePage />);

        expect(screen.getByText('mypage.subscription.mobileOnly')).toBeInTheDocument();
        expect(screen.queryByText('mypage.subscription.subscribe')).not.toBeInTheDocument();
    });
});

describe('CloudManagePage — subscribed', () => {
    it('with no cloud yet, pitches one and offers the add button with the allowance figure', () => {
        render(<CloudManagePage />);

        expect(screen.getByText(`${K}.emptyTip`)).toBeInTheDocument();
        expect(screen.getAllByText('0 / 2')).toHaveLength(2);
        fireEvent.click(screen.getByText(`${K}.addCloud`));
        expect(requestAddCloud).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('plan-card')).toBeInTheDocument();
    });

    it('lists the owned clouds and opens a row into its hub', () => {
        clouds = [
            { id: 'CL1', name: '내 클라우드', status: 'active' },
            { id: 'CL2', name: '작업용', status: 'reserved' },
        ];
        quota = { used: 2, limit: 2 };

        render(<CloudManagePage />);

        expect(screen.queryByText(`${K}.emptyTip`)).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('작업용'));
        expect(navigate).toHaveBeenCalledWith('/mypage/cloud-manage/CL2');
    });

    it('drops the figure, not the button, when the allowance is unresolved', () => {
        quota = { used: 1, limit: null };

        render(<CloudManagePage />);

        expect(screen.getByText(`${K}.addCloud`)).toBeInTheDocument();
        expect(screen.queryByText(/\/ /)).not.toBeInTheDocument();
    });

    it('hides the add button while a banner explains why the server would refuse', () => {
        scene = { ...scene, banner: 'expired' };
        clouds = [{ id: 'CL1', name: '내 클라우드', status: 'suspended' }];

        render(<CloudManagePage />);

        expect(screen.getByTestId('manage-banner')).toBeInTheDocument();
        expect(screen.queryByText(`${K}.addCloud`)).not.toBeInTheDocument();
        expect(screen.getByText('내 클라우드')).toBeInTheDocument();
    });

    it('holds no delete action — releasing moved to the cloud information screen', () => {
        clouds = [{ id: 'CL1', name: '내 클라우드', status: 'active' }];

        render(<CloudManagePage />);

        expect(screen.queryByText(`${K}.delete`)).not.toBeInTheDocument();
    });
});
