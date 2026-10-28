import { act, renderHook, waitFor } from '@testing-library/react';

import { useShareCloud } from './useShareCloud';

let mockSelection: { selectedCloudId: string | null; selectedSiteId: string | null };
const mockSwitchCloud = jest.fn();
const mockSwitchSite = jest.fn();
const mockWaitUntilVerified = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: () => mockSelection,
            useSwitchCloudSession: () => ({ switchCloud: mockSwitchCloud }),
            useSiteSwitch: () => ({ switchSite: mockSwitchSite }),
        },
        connection: { getSocketManager: () => ({ waitUntilVerified: mockWaitUntilVerified }) },
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));

let mockCatalog: Array<Record<string, unknown>>;
let mockInvited: Array<Record<string, unknown>>;
let mockCachedNames: Record<string, string>;
let mockPlaces: { places: Array<{ id: string; name?: string }>; isLoading: boolean };
jest.mock('../../../hooks', () => ({
    useCloudSessionCatalog: () => ({ clouds: mockCatalog }),
    useInvitedClouds: () => ({ invitedClouds: mockInvited }),
    useCachedCloudNames: () => mockCachedNames,
    useActiveCloudPlaces: () => mockPlaces,
}));
const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
    jest.clearAllMocks();
    mockSelection = { selectedCloudId: 'cloud-a', selectedSiteId: 'place-1' };
    mockCatalog = [];
    mockInvited = [];
    mockCachedNames = {};
    mockPlaces = { places: [{ id: 'place-1', name: 'Team' }], isLoading: false };
    mockWaitUntilVerified.mockResolvedValue(true);
    mockSwitchCloud.mockResolvedValue(undefined);
    mockSwitchSite.mockResolvedValue(undefined);
});

describe('useShareCloud — the cloud row', () => {
    it('offers Dou home and every ready cloud once, by the name the device last saw', () => {
        mockCatalog = [
            { id: 'cloud-a', name: 'Old name', status: 'active' },
            { id: 'cloud-b', name: 'Being made', status: 'init' },
        ];
        mockInvited = [
            { id: 'cloud-c', name: 'Friends', status: 'active', cloudType: 'invited' },
            { id: 'cloud-a', name: 'Old name', cloudType: 'invited' },
        ];
        mockCachedNames = { 'cloud-a': 'New name' };

        const { result } = renderHook(() => useShareCloud());

        expect(result.current.clouds).toEqual([
            { id: 'default', name: 'cloudSessionSheet.douHome' },
            { id: 'cloud-a', name: 'New name' },
            { id: 'cloud-c', name: 'Friends' },
        ]);
    });

    it('switches the cloud once the current socket is verified, and says it went through', async () => {
        const { result } = renderHook(() => useShareCloud());

        let switched: boolean | undefined;
        await act(async () => {
            switched = await result.current.changeCloud('cloud-b');
        });

        expect(switched).toBe(true);
        expect(mockWaitUntilVerified).toHaveBeenCalled();
        expect(mockSwitchCloud).toHaveBeenCalledWith('cloud-b');
        expect(result.current.isSwitching).toBe(false);
    });

    it('stays put and says so when the socket never verifies', async () => {
        mockWaitUntilVerified.mockResolvedValue(false);
        const { result } = renderHook(() => useShareCloud());

        await act(async () => result.current.changeCloud('cloud-b'));

        expect(mockSwitchCloud).not.toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith({ title: 'share.switchFailed' });
    });

    it('says so when the switch itself fails, and is ready for another try', async () => {
        mockSwitchCloud.mockRejectedValue(new Error('rolled back'));
        const { result } = renderHook(() => useShareCloud());

        let switched: boolean | undefined;
        await act(async () => {
            switched = await result.current.changeCloud('cloud-b');
        });

        expect(switched).toBe(false);
        expect(mockToast).toHaveBeenCalledWith({ title: 'share.switchFailed' });
        expect(result.current.isSwitching).toBe(false);
    });

    it('does nothing for the cloud already selected', async () => {
        const { result } = renderHook(() => useShareCloud());

        await act(async () => result.current.changeCloud('cloud-a'));

        expect(mockSwitchCloud).not.toHaveBeenCalled();
    });

    it('treats the relay as having no place row', () => {
        mockSelection = { selectedCloudId: 'default', selectedSiteId: 'relay-place' };

        const { result } = renderHook(() => useShareCloud());

        expect(result.current.isRelay).toBe(true);
    });
});

describe('useShareCloud — the place row', () => {
    it('switches the place', async () => {
        mockPlaces = { places: [{ id: 'place-1', name: 'Team' }, { id: 'place-2' }], isLoading: false };
        const { result } = renderHook(() => useShareCloud());

        expect(result.current.places).toEqual([
            { id: 'place-1', name: 'Team' },
            { id: 'place-2', name: 'place-2' },
        ]);
        await act(async () => result.current.changePlace('place-2'));

        expect(mockSwitchSite).toHaveBeenCalledWith('place-2');
    });

    it('picks the first place when a cloud switch left none selected', async () => {
        mockSelection = { selectedCloudId: 'cloud-b', selectedSiteId: null };
        mockPlaces = { places: [{ id: 'place-9' }], isLoading: false };

        renderHook(() => useShareCloud());

        await waitFor(() => expect(mockSwitchSite).toHaveBeenCalledWith('place-9'));
    });

    it('tries that first place once, not again after every failure', async () => {
        mockSelection = { selectedCloudId: 'cloud-b', selectedSiteId: null };
        mockPlaces = { places: [{ id: 'place-9' }], isLoading: false };
        mockSwitchSite.mockRejectedValue(new Error('siteId is invalid'));

        const { result, rerender } = renderHook(() => useShareCloud());
        await waitFor(() => expect(result.current.isSwitching).toBe(false));
        await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
        // The session as a failing switch leaves it on the way: the target shown, then rolled back.
        mockSelection = { selectedCloudId: 'cloud-b', selectedSiteId: 'place-9' };
        rerender();
        mockSelection = { selectedCloudId: 'cloud-b', selectedSiteId: null };
        rerender();
        await act(async () => undefined);

        expect(mockSwitchSite).toHaveBeenCalledTimes(1);
        expect(mockToast).toHaveBeenCalledTimes(1);
    });

    it('tries again on a later visit once a try went through', async () => {
        mockSelection = { selectedCloudId: 'cloud-b', selectedSiteId: null };
        mockPlaces = { places: [{ id: 'place-9' }], isLoading: false };
        mockSwitchSite.mockImplementation(async (sid: string) => {
            mockSelection = { selectedCloudId: 'cloud-b', selectedSiteId: sid };
        });

        const { result, rerender } = renderHook(() => useShareCloud());
        await waitFor(() => expect(mockSwitchSite).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current.isSwitching).toBe(false));
        rerender();
        // Later the person comes back to this cloud and it arrives without a place again.
        mockSelection = { selectedCloudId: 'cloud-b', selectedSiteId: null };
        rerender();

        await waitFor(() => expect(mockSwitchSite).toHaveBeenCalledTimes(2));
    });
});
