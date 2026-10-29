import { useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, render } from '@testing-library/react';

import type * as ChatHooks from '../hooks';
import type * as Shared from '../../../shared';

// A place switch the server refuses: the socket session never moves, so the session's selected site
// rolls back to where it was — a place that is not in this cloud's list.
const { switchCalls, sessionState, socketState } = vi.hoisted(() => ({
    switchCalls: [] as string[],
    sessionState: { selectedSiteId: null as string | null },
    socketState: { isVerified: true },
}));

vi.mock('@chatic/app-runtime', () => {
    const useSiteSwitch = () => {
        const [pending, setPending] = useState(false);
        const switchSite = useCallback(async (siteId: string) => {
            switchCalls.push(siteId);
            // Stop answering past a bound, so a retry loop ends the test instead of hanging it.
            if (switchCalls.length > 20) return new Promise<void>(() => undefined);
            setPending(true);
            try {
                await Promise.resolve();
                throw new Error('auth.switch failed: server');
            } finally {
                setPending(false);
            }
        }, []);
        return { switchSite, isSwitching: pending };
    };
    return {
        runtime: {
            session: {
                useSiteSwitch,
                useSessionSelection: () => ({ selectedSiteId: sessionState.selectedSiteId }),
                useRuntimeProfile: () => ({ isGuest: false, isCloudActive: true }),
                useSessionIdentity: () => ({ userId: 'u1' }),
            },
            connection: {
                useRuntimeSocketState: () => ({ isVerified: socketState.isVerified }),
                getSocketManager: () => ({ waitUntilVerified: async () => true }),
            },
        },
    };
});

vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

vi.mock('../../auth', () => ({
    selectNewAccountPending: () => false,
    useJoinDialogStore: (select: (s: { open: () => void }) => unknown) => select({ open: vi.fn() }),
    useSignInNoticeStore: (select: (s: unknown) => unknown) => select({}),
}));

vi.mock('../../channels', () => ({
    ChannelSettingsPanel: () => null,
    CreateChannelDialog: () => null,
    NewDmDialog: () => null,
    SendInviteDialog: () => null,
    InviteWaitingDialog: () => null,
    PlaceInviteLinkDialog: () => null,
    useChannelMembers: () => ({ members: [], isLoading: false }),
    useChannelSettingsStore: (select: (s: { close: () => void; channelId: null }) => unknown) =>
        select({ close: vi.fn(), channelId: null }),
    useCreateChannelDialogStore: (select: (s: { open: () => void }) => unknown) => select({ open: vi.fn() }),
    useSendInviteStore: (select: (s: { openPlace: () => void }) => unknown) => select({ openPlace: vi.fn() }),
}));

vi.mock('../../debug', () => ({ DebugPanel: () => null }));
vi.mock('../../profile', () => ({
    EditPlaceProfileDialog: () => null,
    useEditPlaceProfileDialogStore: (select: (s: { open: () => void }) => unknown) => select({ open: vi.fn() }),
}));

vi.mock('../components', () => {
    const Null = () => null;
    return {
        ChannelList: Null,
        ChatPane: Null,
        CloudSwitcher: Null,
        CreatePlaceDialog: Null,
        DesktopLayout: Null,
        EditPlaceDialog: Null,
        OnboardingDialog: Null,
        NavRail: Null,
        NavSidebar: Null,
        PlaceRail: Null,
        SidebarHeader: Null,
        SavedPage: Null,
        NotificationsPanel: Null,
        ChannelListPanel: Null,
        DmListPanel: Null,
        ThreadPanel: Null,
        WelcomePage: Null,
    };
});

vi.mock('../hooks', async importOriginal => ({
    ...(await importOriginal<typeof ChatHooks>()),
    useHydrateDmPeers: () => undefined,
    useMessageViewer: () => null,
    useNextUnreadShortcut: () => undefined,
    useRailShortcuts: () => undefined,
    useReadCounts: () => () => undefined,
}));

const PLACES = [{ id: 'place-1' }, { id: 'place-2' }];

vi.mock('../../../shared', async importOriginal => ({
    ...(await importOriginal<typeof Shared>()),
    ProfilePanel: () => null,
    useClouds: () => ({
        clouds: [{ id: 'cloud-1' }],
        activeCloudId: 'cloud-1',
        isCloudsError: false,
        isFetchingClouds: false,
        refetchClouds: vi.fn(),
    }),
    usePlaces: () => ({ places: PLACES, isLoading: false }),
    useChannels: () => ({ channels: [], isLoading: true, filedPlaces: new Map(), memberPeers: [] }),
    useCloudSwitchFlow: () => ({ switchCloud: vi.fn(), isSwitching: false }),
    useSiteProfiles: () => undefined,
    useStartDm: () => ({ isAvailable: false, startDm: vi.fn(), isStarting: false }),
    useDeletePlace: () => ({ deletePlace: vi.fn() }),
    useCloudProfiles: () => new Map(),
    useChannelLabels: () => () => '',
    readPlaceManageAccess: () => false,
    canCreatePlace: () => false,
}));

import { HomePage } from './HomePage';

// Let every switch settle and every effect it re-triggers run.
const settle = async () => {
    for (let i = 0; i < 30; i++) {
        await act(async () => {
            await Promise.resolve();
        });
    }
};

describe('HomePage place auto-select', () => {
    beforeEach(() => {
        switchCalls.length = 0;
        sessionState.selectedSiteId = null;
        socketState.isVerified = true;
    });
    afterEach(cleanup);

    it('tries each place once when the server refuses every switch', async () => {
        render(<HomePage />);

        await settle();

        expect(switchCalls).toEqual(['place-1', 'place-2']);
    });

    it('tries the places again once a dropped socket comes back', async () => {
        const { rerender } = render(<HomePage />);
        await settle();

        socketState.isVerified = false;
        rerender(<HomePage />);
        await settle();
        socketState.isVerified = true;
        rerender(<HomePage />);
        await settle();

        expect(switchCalls).toEqual(['place-1', 'place-2', 'place-1', 'place-2']);
    });
});
