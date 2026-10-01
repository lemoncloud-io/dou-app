import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';

import { useChannelProfiles } from './useChannelProfiles';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        connection: {
            useCloudVerified: jest.fn(),
        },
        sync: {
            getSyncManager: jest.fn(),
        },
        session: {
            useSessionSelection: jest.fn(),
            getGlobalSessionContext: jest.fn(),
            useUidInCloud: jest.fn(),
        },
    },
}));

const observeList = jest.fn();
const cacheReadList = jest.fn();
const refreshItem = jest.fn();
const registerProfile = jest.fn();

const profile = (userId: string, fields: Partial<DomainProfile> = {}): DomainProfile =>
    ({ userId, ...fields }) as unknown as DomainProfile;

// Seed observeList to emit the given rows synchronously and return a disposer spy.
const seedObserve = (rows: DomainProfile[]) => {
    observeList.mockImplementation((_query, cb) => {
        cb({ list: rows });
        return () => undefined;
    });
};

// The selection as render sees it and as the live session context reports it — one value, as in the app.
const setSelectedCloud = (cid: string) => {
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: cid });
    (runtime.session.getGlobalSessionContext as jest.Mock).mockReturnValue({ cloud: { cloudId: cid } });
};

beforeEach(() => {
    jest.clearAllMocks();
    registerProfile.mockReturnValue(() => undefined);
    seedObserve([]);
    cacheReadList.mockResolvedValue({ list: [] });
    refreshItem.mockResolvedValue(null);
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        profile: { observeList, cacheReadList, refreshItem },
    });
    (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
    setSelectedCloud('cloud-a');
    (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me');
    (runtime.sync.getSyncManager as jest.Mock).mockReturnValue({ registerProfile });
});

describe('useChannelProfiles — 사이트 프로필 구독/동기화', () => {
    it('observe 결과를 userId 기준 profileMap으로 만든다', () => {
        seedObserve([profile('u1', { nick: 'Al' }), profile('u2', { nick: 'Bo' })]);

        const { result } = renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        expect(observeList).toHaveBeenCalledWith({ sid: 's1' }, expect.any(Function));
        expect(result.current.profileMap.get('u1')?.nick).toBe('Al');
        expect(result.current.profileMap.get('u2')?.nick).toBe('Bo');
    });

    it('registers a cached member, and an uncached one whose bootstrap found a profile', async () => {
        cacheReadList.mockResolvedValue({ list: [profile('u1')] });

        renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        await waitFor(() => expect(registerProfile).toHaveBeenCalledTimes(2));
        // Default interval is 20s — member count / interval is directly the request rate, so a
        // 5s interval in a 20-person room would have meant 4 requests per second.
        expect(registerProfile).toHaveBeenCalledWith('s1@u1', 20_000, { cid: 'cloud-a' });
        expect(registerProfile).toHaveBeenCalledWith('s1@u2', 20_000, { cid: 'cloud-a' });
    });

    it('캐시에 없는 멤버만 refreshItem으로 즉시 부트스트랩한다', async () => {
        cacheReadList.mockResolvedValue({ list: [profile('u1')] });

        renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        await waitFor(() => expect(refreshItem).toHaveBeenCalledTimes(1));
        expect(refreshItem).toHaveBeenCalledWith('s1@u2');
    });

    it.each(['408 REQUEST TIMEOUT - profile.get', '403 FORBIDDEN - profile.get', 'network'])(
        'still registers a member whose bootstrap failed for a reason other than absence (%s)',
        async message => {
            cacheReadList.mockResolvedValue({ list: [] });
            refreshItem.mockRejectedValue(new Error(message));

            renderHook(() => useChannelProfiles('s1', ['u1']));

            await waitFor(() => expect(registerProfile).toHaveBeenCalledWith('s1@u1', 20_000, { cid: 'cloud-a' }));
        }
    );

    it('does not poll a member the bootstrap was told has no profile here', async () => {
        // No emission, so `hasSnapshot` can only come from the bootstrap settling — the point at
        // which every registration this run makes has already been made.
        observeList.mockImplementation(() => () => undefined);
        cacheReadList.mockResolvedValue({ list: [profile('u1')] });
        refreshItem.mockRejectedValue(new Error('404 NOT FOUND - not found @doGet(profiles/s1@u2)'));

        const { result } = renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        await waitFor(() => expect(result.current.hasSnapshot).toBe(true));
        expect(refreshItem).toHaveBeenCalledWith('s1@u2');
        expect(registerProfile).toHaveBeenCalledTimes(1);
        expect(registerProfile).toHaveBeenCalledWith('s1@u1', 20_000, { cid: 'cloud-a' });
    });

    it('registers every member when the cache cannot be read', async () => {
        cacheReadList.mockRejectedValue(new Error('idb'));

        renderHook(() => useChannelProfiles('s1', ['u1', 'u2']));

        await waitFor(() => expect(registerProfile).toHaveBeenCalledTimes(2));
        expect(refreshItem).not.toHaveBeenCalled();
    });

    it('registers nothing after an unmount that lands before the bootstrap settles', async () => {
        let resolveRefresh: (value: null) => void = () => undefined;
        refreshItem.mockReturnValue(new Promise(resolve => (resolveRefresh = resolve)));

        const { unmount } = renderHook(() => useChannelProfiles('s1', ['u1']));
        await waitFor(() => expect(refreshItem).toHaveBeenCalled());

        unmount();
        await act(async () => resolveRefresh(null));

        expect(registerProfile).not.toHaveBeenCalled();
    });

    it('sid가 없으면 구독/등록하지 않는다', () => {
        renderHook(() => useChannelProfiles(null, ['u1']));
        expect(observeList).not.toHaveBeenCalled();
        expect(registerProfile).not.toHaveBeenCalled();
    });

    it('isVerified가 false면 등록하지 않는다', () => {
        (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(false);

        renderHook(() => useChannelProfiles('s1', ['u1']));

        expect(registerProfile).not.toHaveBeenCalled();
    });

    it('언마운트 시 등록한 sync를 해제한다', async () => {
        const dispose = jest.fn();
        registerProfile.mockReturnValue(dispose);

        const { unmount } = renderHook(() => useChannelProfiles('s1', ['u1']));
        await waitFor(() => expect(registerProfile).toHaveBeenCalledTimes(1));

        unmount();
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it("registers under the selected cloud and waits for that cloud's slot", async () => {
        setSelectedCloud('cloud-b');

        renderHook(() => useChannelProfiles('s1', ['u1']));

        expect(runtime.connection.useCloudVerified).toHaveBeenCalledWith('cloud-b');
        expect(runtime.session.useUidInCloud).toHaveBeenCalledWith('cloud-b');
        await waitFor(() => expect(registerProfile).toHaveBeenCalledWith('s1@u1', 20_000, { cid: 'cloud-b' }));
    });

    it('re-registers when the uid in the cloud changes', async () => {
        const { rerender } = renderHook(() => useChannelProfiles('s1', ['u1']));
        await waitFor(() => expect(registerProfile).toHaveBeenCalledTimes(1));

        (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me-again');
        rerender();

        await waitFor(() => expect(registerProfile).toHaveBeenCalledTimes(2));
    });

    it('does not bootstrap members when the selection moved during the cache read', async () => {
        let resolveRead!: (value: { list: DomainProfile[] }) => void;
        cacheReadList.mockReturnValue(new Promise(resolve => (resolveRead = resolve)));

        renderHook(() => useChannelProfiles('s1', ['u1']));
        // The session has already moved on; no render has told the hook yet.
        (runtime.session.getGlobalSessionContext as jest.Mock).mockReturnValue({ cloud: { cloudId: 'cloud-b' } });
        await act(async () => {
            resolveRead({ list: [] });
        });

        expect(refreshItem).not.toHaveBeenCalled();
        // Registered unread — the poll is all that is left to find the member with.
        expect(registerProfile).toHaveBeenCalledWith('s1@u1', 20_000, { cid: 'cloud-a' });
    });
});
