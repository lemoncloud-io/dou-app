import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { logger } from '@chatic/bridges';

import { CloudSessionSheet } from './CloudSessionSheet';
import { useCloudPushMarkStore } from '../stores/useCloudPushMarkStore';

// NOTE: @chatic/web-ui-kit is deliberately NOT mocked here. The point of this suite is the
// composition — three real CollapsibleSections, with the add-cloud button living in the owned
// section's footer so it survives a collapse. Stubbing the kit away would test nothing.

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useInterval: () => undefined }));
const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

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

jest.mock('@chatic/web-core', () => ({
    useCloudSessionCatalog: () => ({ ...catalog, refetchClouds: jest.fn() }),
    useSessionSelection: () => ({ selectedCloudId }),
    useSwitchCloudSession: () => ({ switchCloud, isPending: false }),
}));
jest.mock('../../../runtime/useLogoutCloudSession', () => ({
    useLogoutCloudSession: () => ({ logoutCloudSession, isLoggingOutCloudSession: false }),
}));
jest.mock('../../../hooks', () => ({
    useCachedCloudNames: () => ({}),
    useInvitedClouds: () => ({ invitedClouds: invited }),
}));
// The real CloudPromoBanner is kept (so the 0-cloud branch is exercised); only its decision hook,
// which reaches into the preference store and thus the app bridge, is stubbed.
jest.mock('../hooks/useCloudPromo', () => ({
    useCloudPromo: () => ({ isVisible: promoVisible, dismiss: jest.fn() }),
}));

const activeCloud = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    status: 'active',
    email: `${id}@example.com`,
    createdAt: 1,
    ...over,
});

const onAddCloud = jest.fn();
const refreshCloudUnread = jest.fn();
let cloudUnread: Record<string, number> = {};
const renderSheet = () =>
    render(
        <CloudSessionSheet
            open
            onOpenChange={jest.fn()}
            onAddCloud={onAddCloud}
            cloudUnread={cloudUnread}
            refreshCloudUnread={refreshCloudUnread}
        />
    );

beforeEach(() => {
    jest.clearAllMocks();
    catalog = { clouds: [], isCloudsError: false, isFetchingClouds: false, isPendingClouds: false };
    selectedCloudId = 'default';
    invited = [];
    promoVisible = true;
    cloudUnread = {};
    useCloudPushMarkStore.setState({ badged: {} });
});

describe('CloudSessionSheet — section layout', () => {
    it('renders the three sections in order, replacing the old two-tab layout', () => {
        catalog.clouds = [activeCloud('c1')];
        invited = [{ id: 'i1', cid: 'i1', name: 'Invited' }];

        const { baseElement } = renderSheet();

        // CollapsibleSection renders a <section> per group; its title is a <span>, not a heading
        // (SectionHeader has never used heading markup), so assert DOM order instead of roles.
        const titles = [...baseElement.querySelectorAll('section')].map(s => s.querySelector('span')?.textContent);
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

        // The counts replaced the old "(N)" suffix on the invited tab label.
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
        const rowBefore = screen.getByText('c1@example.com');

        // Collapse "내 클라우드" and let the height transition finish so its body unmounts.
        const toggles = screen.getAllByRole('button', { name: 'cloudSessionSheet.toggleSection' });
        const grid = rowBefore.closest('.grid') as HTMLElement;
        fireEvent.click(toggles[1]);
        fireEvent.transitionEnd(grid);

        expect(screen.queryByText('c1@example.com')).not.toBeInTheDocument();
        // This is the regression the footer slot exists for.
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
        expect(screen.getByText('c1@example.com')).toBeInTheDocument();
        expect(screen.queryByText(/cloudPromo\.title/)).not.toBeInTheDocument();
    });

    it('shows the skeleton on the first load, before any data has arrived', () => {
        catalog.isPendingClouds = true;
        catalog.isFetchingClouds = true;

        const { baseElement } = renderSheet();

        expect(baseElement.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('keeps the promo visible through a BACKGROUND refetch instead of flashing the skeleton', () => {
        // The regression: `isLoading` used to be `isFetching && clouds.length === 0`, so every
        // refetch (the sheet refetches on open, and useClouds is refetchOnMount: 'always') replaced
        // the banner with a skeleton. Because the banner subscribed to that same query, mounting it
        // kicked off the next refetch — an endless shimmer for a zero-cloud account.
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
        fireEvent.click(screen.getByText('c1@example.com'));

        expect(switchCloud).toHaveBeenCalledWith('c1');
    });

    it('does not offer a rename affordance on owned rows', () => {
        catalog.clouds = [activeCloud('c1')];

        renderSheet();

        // The pencil (and CloudNameEditDialog) were removed — /mypage/cloud-profile is the only path.
        expect(screen.queryByRole('button', { name: /edit|이름|rename/i })).not.toBeInTheDocument();
    });
});

describe('CloudSessionSheet — presence dots (ADR-0056)', () => {
    // The 6×6 red dot became the 20×20 "N" badge (Figma 4147:24964), so match on the badge's
    // accessible label (CloudUnreadBadge) rather than on its fill class.
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

    it('explains the state and keeps the server trace out of the toast', () => {
        catalog = {
            clouds: [{ id: 'CL9', status: 'error', error: rawError, createdAt: 1 }],
            isCloudsError: false,
            isFetchingClouds: false,
            isPendingClouds: false,
        };

        renderSheet();
        fireEvent.click(screen.getByText('cloudSessionSheet.statusErrorDescription'));

        expect(toast).toHaveBeenCalledWith({
            title: 'cloudSessionSheet.statusErrorTitle',
            description: 'cloudSessionSheet.statusErrorGuide',
            variant: 'destructive',
        });
        // The trace is for the log, not the user.
        expect(logger.warn).toHaveBeenCalledWith('CLOUD', expect.any(String), {
            cloudId: 'CL9',
            error: rawError,
        });
        expect(screen.queryByText(rawError)).not.toBeInTheDocument();
    });
});
