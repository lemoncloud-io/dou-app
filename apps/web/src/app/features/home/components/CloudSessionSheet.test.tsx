import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { logger } from '@chatic/bridges';

import { CloudSessionSheet } from './CloudSessionSheet';
import { useCloudPushMarkStore } from '../stores/useCloudPushMarkStore';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const navigate = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useInterval: () => undefined,
    useNavigateWithTransition: () => navigate,
}));
const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const switchCloud = jest.fn().mockResolvedValue(undefined);
const logoutCloudSession = jest.fn().mockResolvedValue(undefined);

let catalog: {
    clouds: unknown[];
    isCloudsError: boolean;
    isFetchingClouds: boolean;
    isPendingClouds: boolean;
} = {
    clouds: [],
    isCloudsError: false,
    isFetchingClouds: false,
    isPendingClouds: false,
};
let selectedCloudId: string | null = 'default';
let invited: unknown[] = [];
let promoVisible = true;
let accountGuest = false;
let pairedCloudIds: string[] = [];
let pairedCloudNames: Record<string, string> = {};
let pairingEnabled = false;
const forgetRefusedPairedCloud = jest.fn((_id: string, _e: unknown) => false);
const isRefusedForEndedPairing = jest.fn((_e: unknown) => false);

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        session: {
            useSessionSelection: () => ({ selectedCloudId }),
            useSwitchCloudSession: () => ({ switchCloud, isPending: false }),
            usePairedCloudIds: () => pairedCloudIds,
            usePairedCloudNames: () => pairedCloudNames,
            forgetRefusedPairedCloud: (id: string, e: unknown) => forgetRefusedPairedCloud(id, e),
            isRefusedForEndedPairing: (e: unknown) => isRefusedForEndedPairing(e),
        },
        settings: {
            useConfigValue: (key: string) => (key === 'feature.auth.devicePairing' ? pairingEnabled : undefined),
        },
    })
);
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ ...catalog, refetchClouds: jest.fn() }),
}));
jest.mock('../../../runtime/useLogoutCloudSession', () => ({
    useLogoutCloudSession: () => ({ logoutCloudSession, isLoggingOutCloudSession: false }),
}));
const logoutSession = jest.fn(() => Promise.resolve());
jest.mock('../../../runtime/useSessionLogout', () => ({ useSessionLogout: () => logoutSession }));
jest.mock('../../../hooks', () => ({
    useCachedCloudNames: () => ({}),
    useInvitedClouds: () => ({ invitedClouds: invited }),
    useIsAccountGuest: () => accountGuest,
}));
jest.mock('../hooks/useCloudPromo', () => ({
    useCloudPromo: () => ({ isVisible: promoVisible, dismiss: jest.fn() }),
}));

const activeCloud = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    name: `Cloud ${id}`,
    status: 'active',
    email: `${id}@example.com`,
    createdAt: 1,
    ...over,
});

const onAddCloud = jest.fn();
let cloudUnread: Record<string, number> = {};
const renderSheet = () =>
    render(<CloudSessionSheet open onOpenChange={jest.fn()} onAddCloud={onAddCloud} cloudUnread={cloudUnread} />);

beforeEach(() => {
    jest.clearAllMocks();
    catalog = { clouds: [], isCloudsError: false, isFetchingClouds: false, isPendingClouds: false };
    selectedCloudId = 'default';
    invited = [];
    promoVisible = true;
    cloudUnread = {};
    useCloudPushMarkStore.setState({ badged: {} });
    accountGuest = false;
    pairedCloudIds = [];
    pairedCloudNames = {};
    pairingEnabled = false;
});

describe('CloudSessionSheet — section layout', () => {
    it('renders the three sections in order, replacing the old two-tab layout', () => {
        catalog.clouds = [activeCloud('c1')];
        invited = [{ id: 'i1', cid: 'i1', name: 'Invited' }];

        const { baseElement } = renderSheet();

        const titles = Array.from(baseElement.querySelectorAll('section')).map(
            s => s.querySelector('span')?.textContent
        );
        expect(titles).toEqual([
            'cloudSessionSheet.sectionHome',
            'cloudSessionSheet.sectionMy',
            'cloudSessionSheet.sectionInvited',
        ]);
    });

    it('shows the owned and invited counts on the section headers', () => {
        catalog.clouds = [activeCloud('c1'), activeCloud('c2')];
        invited = [{ id: 'i1', cid: 'i1', name: 'Invited' }];

        renderSheet();

        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
    });
});

describe('CloudSessionSheet — add cloud affordance', () => {
    it('shows the add button even when a cloud is already owned (the cap is a toast, not a hidden button)', () => {
        catalog.clouds = [activeCloud('c1')];

        renderSheet();

        fireEvent.click(screen.getByRole('button', { name: /cloudSessionSheet\.addAccount/ }));
        expect(onAddCloud).toHaveBeenCalledTimes(1);
    });

    it('keeps the add button reachable while the owned section is collapsed', () => {
        catalog.clouds = [activeCloud('c1')];

        renderSheet();
        const rowBefore = screen.getByText('Cloud c1');

        const toggles = screen.getAllByRole('button', { name: 'cloudSessionSheet.toggleSection' });
        const grid = rowBefore.closest('.grid') as HTMLElement;
        fireEvent.click(toggles[1]);
        fireEvent.transitionEnd(grid);

        expect(screen.queryByText('Cloud c1')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cloudSessionSheet\.addAccount/ })).toBeInTheDocument();
        expect(screen.getByText('cloudSessionSheet.myCloudsDescription')).toBeInTheDocument();
    });
});

describe('CloudSessionSheet — owned section body', () => {
    it('pitches a cloud instead of a caption when none is owned', () => {
        catalog.clouds = [];

        renderSheet();

        expect(screen.getByText(/cloudPromo\.title/)).toBeInTheDocument();
        expect(screen.queryByText('cloudSessionSheet.myCloudsDescription')).not.toBeInTheDocument();
    });

    it('drops the pitch once it has been dismissed, leaving the add button', () => {
        catalog.clouds = [];
        promoVisible = false;

        renderSheet();

        expect(screen.queryByText(/cloudPromo\.title/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cloudSessionSheet\.addAccount/ })).toBeInTheDocument();
    });

    it('shows the caption and the rows once a cloud is owned', () => {
        catalog.clouds = [activeCloud('c1')];

        renderSheet();

        expect(screen.getByText('cloudSessionSheet.myCloudsDescription')).toBeInTheDocument();
        expect(screen.getByText('Cloud c1')).toBeInTheDocument();
        expect(screen.queryByText(/cloudPromo\.title/)).not.toBeInTheDocument();
    });

    it('shows the skeleton on the first load, before any data has arrived', () => {
        catalog.isPendingClouds = true;
        catalog.isFetchingClouds = true;

        const { baseElement } = renderSheet();

        expect(baseElement.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('keeps the promo visible through a BACKGROUND refetch instead of flashing the skeleton', () => {
        catalog.clouds = [];
        catalog.isPendingClouds = false;
        catalog.isFetchingClouds = true;

        const { baseElement } = renderSheet();

        expect(baseElement.querySelector('.animate-pulse')).toBeNull();
        expect(screen.getByText(/cloudPromo\.title/)).toBeInTheDocument();
    });

    it('surfaces a retry affordance when the catalog fetch failed', () => {
        catalog.isCloudsError = true;

        renderSheet();

        expect(screen.getByText('cloudSessionSheet.errorLoading')).toBeInTheDocument();
        expect(screen.getByText('cloudSessionSheet.retry')).toBeInTheDocument();
    });
});

describe('CloudSessionSheet — selection', () => {
    it('returns to relay when the DoU Home row is picked', async () => {
        catalog.clouds = [activeCloud('c1')];
        selectedCloudId = 'c1';

        renderSheet();
        fireEvent.click(screen.getByText('cloudSessionSheet.douHome'));

        expect(logoutCloudSession).toHaveBeenCalledTimes(1);
        expect(switchCloud).not.toHaveBeenCalled();
    });

    it('switches to an owned cloud when its row is picked', () => {
        catalog.clouds = [activeCloud('c1')];
        selectedCloudId = 'default';

        renderSheet();
        fireEvent.click(screen.getByText('Cloud c1'));

        expect(switchCloud).toHaveBeenCalledWith('c1');
    });

    it('records the switch once it lands, and leaves the failure to the session service', async () => {
        catalog.clouds = [activeCloud('c1')];
        selectedCloudId = 'default';

        renderSheet();
        fireEvent.click(screen.getByText('Cloud c1'));
        await waitFor(() =>
            expect(logger.info).toHaveBeenCalledWith('CLOUD', 'cloud switch succeeded', { cloudId: 'c1' })
        );

        expect(logger.error).not.toHaveBeenCalled();
    });

    it('records a failed disconnect instead of swallowing it', async () => {
        const boom = new Error('disconnect boom');
        logoutCloudSession.mockRejectedValueOnce(boom);
        catalog.clouds = [activeCloud('c1')];
        selectedCloudId = 'c1';

        renderSheet();
        fireEvent.click(screen.getByText('cloudSessionSheet.douHome'));

        await waitFor(() =>
            expect(logger.error).toHaveBeenCalledWith('CLOUD', 'cloud session disconnect failed', { error: boom })
        );
    });

    it('does not offer a rename affordance on owned rows', () => {
        catalog.clouds = [activeCloud('c1')];

        renderSheet();

        expect(screen.queryByRole('button', { name: /edit|이름|rename/i })).not.toBeInTheDocument();
    });
});

describe('CloudSessionSheet — presence dots (ADR-0056)', () => {
    const UNREAD_BADGE = '[aria-label="cloudSessionSheet.unreadBadge"]';
    const dotCount = (baseElement: HTMLElement) => baseElement.querySelectorAll(UNREAD_BADGE).length;

    it('캐시 힌트(cloudUnread)만으로도 오너 클라우드 행에 점이 뜬다', () => {
        catalog.clouds = [activeCloud('c1')];
        cloudUnread = { c1: 3 };

        const { baseElement } = renderSheet();

        expect(dotCount(baseElement)).toBe(1);
    });

    it('푸시 마크만으로도(캐시 힌트 없이) 오너 클라우드 행에 점이 뜬다', () => {
        catalog.clouds = [activeCloud('c1')];
        useCloudPushMarkStore.setState({ badged: { c1: true } });

        const { baseElement } = renderSheet();

        expect(dotCount(baseElement)).toBe(1);
    });

    it('활성 클라우드에 마크가 있어도(스테일) 그 행에는 점을 그리지 않는다', () => {
        catalog.clouds = [activeCloud('c1')];
        selectedCloudId = 'c1';
        useCloudPushMarkStore.setState({ badged: { c1: true } });

        const { baseElement } = renderSheet();

        expect(dotCount(baseElement)).toBe(0);
    });

    it('카탈로그에 없는 클라우드의 마크는 무시한다', () => {
        catalog.clouds = [activeCloud('c1')];
        useCloudPushMarkStore.setState({ badged: { 'cloud-not-in-catalog': true } });

        const { baseElement } = renderSheet();

        expect(dotCount(baseElement)).toBe(0);
    });

    it("relay('default') 마크는 DoU Home 행에 점을 띄운다", () => {
        selectedCloudId = 'c1';
        catalog.clouds = [activeCloud('c1')];
        useCloudPushMarkStore.setState({ badged: { default: true } });

        renderSheet();

        const homeRow = screen.getByText('cloudSessionSheet.douHome').closest('button') as HTMLElement;
        expect(homeRow.querySelector(UNREAD_BADGE)).not.toBeNull();
    });

    it('초대받은 클라우드 행에도 마크로 점이 뜬다', () => {
        invited = [{ id: 'i1', cid: 'i1', name: 'Lemon Cloud', owner$: { name: 'sunny' } }];
        useCloudPushMarkStore.setState({ badged: { i1: true } });

        const { baseElement } = renderSheet();

        expect(dotCount(baseElement)).toBe(1);
    });
});

describe('CloudSessionSheet — invited section', () => {
    it('shows an empty state when nothing is invited', () => {
        renderSheet();

        expect(screen.getByText('cloudSessionSheet.emptyInvited')).toBeInTheDocument();
    });

    it('lists invited clouds with the owner caption', () => {
        invited = [{ id: 'i1', cid: 'i1', name: 'Lemon Cloud', owner$: { name: 'sunny' } }];

        renderSheet();

        expect(screen.getByText('Lemon Cloud')).toBeInTheDocument();
        expect(screen.getByText('cloudSessionSheet.invitedOwnerLabel')).toBeInTheDocument();
    });
});

describe('CloudSessionSheet — failed cloud row', () => {
    const rawError = '.accountNo[#mock:1001494] is invalid (duplicated by 1000038)';

    it('opens the cloud in cloud management and keeps the server trace in the log', () => {
        catalog = {
            clouds: [{ id: 'CL9', status: 'error', error: rawError, createdAt: 1 }],
            isCloudsError: false,
            isFetchingClouds: false,
            isPendingClouds: false,
        };

        renderSheet();
        fireEvent.click(screen.getByText('cloudSessionSheet.checkInfo'));

        expect(navigate).toHaveBeenCalledWith('/mypage/cloud-manage/CL9');
        expect(toast).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith('CLOUD', expect.any(String), {
            cloudId: 'CL9',
            error: rawError,
        });
        expect(screen.queryByText(rawError)).not.toBeInTheDocument();
    });
});

describe('CloudSessionSheet — clouds a guest entered through a pairing', () => {
    it('lists them for a guest, with the way to add another', () => {
        accountGuest = true;
        pairingEnabled = true;
        pairedCloudIds = ['1000002'];
        renderSheet();

        expect(screen.getByText('pairing.cloud.section')).toBeInTheDocument();
        expect(screen.getByTestId('paired-cloud-1000002')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('paired-cloud-add'));
        expect(navigate).toHaveBeenCalledWith('/mypage/login/pair');
    });

    it('names a paired cloud by the name read from inside it, and by its id until then', () => {
        accountGuest = true;
        pairedCloudIds = ['1000002', '1000004'];
        pairedCloudNames = { '1000002': 'Team Cloud' };
        renderSheet();

        expect(screen.getByTestId('paired-cloud-1000002')).toHaveTextContent('Team Cloud');
        expect(screen.getByTestId('paired-cloud-1000004')).toHaveTextContent('pairing.cloud.unnamed');
    });

    it('enters a paired cloud through the ordinary switch', async () => {
        accountGuest = true;
        pairedCloudIds = ['1000002'];
        renderSheet();

        fireEvent.click(screen.getByTestId('paired-cloud-1000002'));

        await waitFor(() => expect(switchCloud).toHaveBeenCalledWith('1000002'));
    });

    it('says so and signs out when a refused switch dropped the paired cloud', async () => {
        accountGuest = true;
        pairedCloudIds = ['1000002'];
        const refused = new Error('403');
        switchCloud.mockRejectedValueOnce(refused);
        forgetRefusedPairedCloud.mockReturnValueOnce(true);
        renderSheet();

        fireEvent.click(screen.getByTestId('paired-cloud-1000002'));

        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'pairing.cloud.ended' }));
        expect(forgetRefusedPairedCloud).toHaveBeenCalledWith('1000002', refused);
        expect(logoutSession).toHaveBeenCalledTimes(1);
    });

    it("signs out when a revoked pairing blocks the device's own invited cloud", async () => {
        invited = [{ id: 'i1', cid: 'i1', name: 'Lemon Cloud', owner$: { name: 'sunny' } }];
        const refused = new Error('403 NOT ALLOWED - pairing revoked');
        switchCloud.mockRejectedValueOnce(refused);
        isRefusedForEndedPairing.mockReturnValueOnce(true);
        renderSheet();

        fireEvent.click(screen.getByText('Lemon Cloud'));

        await waitFor(() => expect(logoutSession).toHaveBeenCalledTimes(1));
        expect(toast).toHaveBeenCalledWith({ title: 'pairing.cloud.ended' });
        expect(isRefusedForEndedPairing).toHaveBeenCalledWith(refused);
    });

    it('stays quiet about any other refused switch', async () => {
        invited = [{ id: 'i1', cid: 'i1', name: 'Lemon Cloud', owner$: { name: 'sunny' } }];
        switchCloud.mockRejectedValueOnce(new Error('Network Error'));
        renderSheet();

        fireEvent.click(screen.getByText('Lemon Cloud'));

        await waitFor(() => expect(isRefusedForEndedPairing).toHaveBeenCalled());
        expect(toast).not.toHaveBeenCalled();
        expect(logoutSession).not.toHaveBeenCalled();
    });

    it('is not shown to an account, which has its own catalog', () => {
        pairingEnabled = true;
        pairedCloudIds = ['1000002'];
        renderSheet();

        expect(screen.queryByText('pairing.cloud.section')).toBeNull();
    });
});
