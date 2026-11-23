import { act, renderHook } from '@testing-library/react';
import { useIsMutating } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';

import { useChannelSyncMarkStore } from '../stores/useChannelSyncMarkStore';
import { requestBackgroundRefresh } from './backgroundRefresh';
import { syncStreakReporter } from './logging/syncStreakReporter';
import { useBackgroundSync } from './useBackgroundSync';

jest.mock('@tanstack/react-query', () => ({ useIsMutating: jest.fn() }));
jest.mock('@chatic/runtime', () => ({
    runtime: {
        session: {
            SWITCH_SITE_MUTATION_KEY: ['session', 'switch-site'],
            useRuntimeProfile: jest.fn(),
            useGlobalSession: jest.fn(),
            useSessionSelection: jest.fn(),
            SWITCH_CLOUD_MUTATION_KEY: ['session', 'switch-cloud'],
        },
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        connection: {
            useRuntimeSocketState: jest.fn(),
        },
    },
}));

jest.mock('../bridge', () => ({ useAppForeground: jest.fn() }));
jest.mock('./logging/syncStreakReporter', () => ({
    syncStreakReporter: { fail: jest.fn(), succeed: jest.fn(), reset: jest.fn() },
}));

import { useAppForeground } from '../bridge';

const refreshList = jest.fn();
const getSelfChannel = jest.fn();
const syncChannels = jest.fn();
const syncProfiles = jest.fn();
const getMyProfile = jest.fn();
const getSyncedAt = jest.fn();
const setSyncedAt = jest.fn();
const inviteList = jest.fn();
const inviteCacheReadList = jest.fn();

const cachedInvites = (...states: string[]) => ({
    list: states.map((state, index) => ({ id: `invt-${index}`, state })),
    meta: { total: states.length, source: 'local' as const },
});

const setVerified = (isVerified: boolean) =>
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified });
const fireForeground = async () => {
    const handler = (useAppForeground as jest.Mock).mock.calls.at(-1)?.[0];
    await act(async () => {
        handler?.();
    });
};
const setSwitching = (switching: boolean) => (useIsMutating as jest.Mock).mockReturnValue(switching ? 1 : 0);
const setSession = (cid: string, selectedSiteId: string | null, userId: string | null = 'u1') => {
    (runtime.session.useGlobalSession as jest.Mock).mockReturnValue({
        activeServer: cid === 'default' ? { kind: 'relay' } : { kind: 'cloud', cloudId: cid },
        identity: { userId },
    });
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId });
};

beforeEach(() => {
    jest.clearAllMocks();
    useChannelSyncMarkStore.setState({ synced: {} });
    refreshList.mockResolvedValue(undefined);
    getSelfChannel.mockResolvedValue(undefined);
    syncChannels.mockResolvedValue({ syncedAt: 100 });
    syncProfiles.mockResolvedValue({ syncedAt: 200 });
    getSyncedAt.mockResolvedValue(0);
    setSyncedAt.mockResolvedValue(undefined);
    getMyProfile.mockResolvedValue(undefined);
    inviteList.mockResolvedValue([]);
    inviteCacheReadList.mockResolvedValue(cachedInvites());
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        place: { refreshList },
        channel: { getSelfChannel, syncChannels },
        profile: { syncProfiles },
        user: { getMyProfile },
        syncMeta: { getSyncedAt, setSyncedAt },
        invite: { list: inviteList, cacheReadList: inviteCacheReadList },
    });
    setSwitching(false);
    setSession('default', 's1');
    (runtime.session.useRuntimeProfile as jest.Mock).mockReturnValue({ isGuest: false });
});

describe('useBackgroundSync — 백그라운드 동기화', () => {
    it('verified 상승 엣지(false→true)에서 1회 동기화한다', async () => {
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        expect(refreshList).not.toHaveBeenCalled();

        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(refreshList).toHaveBeenCalledTimes(1);
        expect(syncChannels).toHaveBeenCalledTimes(1);
    });

    it('verified 유지 시 주기 타이머마다 다시 동기화한다', async () => {
        jest.useFakeTimers();
        setVerified(true);
        renderHook(() => useBackgroundSync());

        await act(async () => undefined);
        expect(syncChannels).toHaveBeenCalledTimes(1);

        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });
        expect(syncChannels).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
    });

    it('전환 진행 중이면 주기 타이머를 건너뛴다', async () => {
        jest.useFakeTimers();
        setVerified(true);
        setSwitching(true);
        renderHook(() => useBackgroundSync());

        await act(async () => undefined);
        const afterMount = syncChannels.mock.calls.length;

        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });
        expect(syncChannels).toHaveBeenCalledTimes(afterMount);

        jest.useRealTimers();
    });

    it('워터마크를 get→sync→set 순서로, cid 키로 전진시킨다', async () => {
        getSyncedAt.mockResolvedValue(50);
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(getSyncedAt).toHaveBeenCalledWith('channel-sync:default');
        expect(syncChannels).toHaveBeenCalledWith(50);
        expect(setSyncedAt).toHaveBeenCalledWith('channel-sync:default', 100);
        expect(getSyncedAt).toHaveBeenCalledWith('profile-sync:default:s1');
        expect(syncProfiles).toHaveBeenCalledWith(50, 's1');
        expect(setSyncedAt).toHaveBeenCalledWith('profile-sync:default:s1', 200);
    });

    it('활성 사이트가 없으면 프로필 동기화를 건너뛴다', async () => {
        setSession('default', null);
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(syncProfiles).not.toHaveBeenCalled();
    });

    it('verified 상승 엣지에서 활성 사이트의 self(나와의 채팅) 채널을 1회 불러온다', async () => {
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        expect(getSelfChannel).not.toHaveBeenCalled();

        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(getSelfChannel).toHaveBeenCalledTimes(1);
    });

    it('주기 타이머 틱에서는 self 채널을 불러오지 않는다', async () => {
        jest.useFakeTimers();
        setVerified(true);
        renderHook(() => useBackgroundSync());

        await act(async () => undefined);
        expect(getSelfChannel).toHaveBeenCalledTimes(1);

        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });
        expect(getSelfChannel).toHaveBeenCalledTimes(1);
        expect(syncChannels).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
    });

    it('활성 사이트가 없으면 self 채널 조회를 건너뛴다', async () => {
        setSession('default', null);
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(getSelfChannel).not.toHaveBeenCalled();
    });

    it('self 채널 조회 실패가 다른 동기화를 막지 않는다', async () => {
        getSelfChannel.mockRejectedValue(new Error('boom'));
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(syncProfiles).toHaveBeenCalledTimes(1);
    });

    it('포그라운드 복귀 신호에서 목록 델타만 갱신하고 self 채널은 재조회하지 않는다', async () => {
        setVerified(true);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        syncChannels.mockClear();
        getSelfChannel.mockClear();

        await fireForeground();

        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(getSelfChannel).not.toHaveBeenCalled();
    });

    it('미인증이면 포그라운드 복귀에서 쏘지 않고, 재인증 상승 엣지(Trigger 1)가 대신 동기화한다', async () => {
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        expect(syncChannels).not.toHaveBeenCalled();

        await fireForeground();
        expect(syncChannels).not.toHaveBeenCalled();
        expect(getSelfChannel).not.toHaveBeenCalled();

        setVerified(true);
        await act(async () => {
            rerender();
        });
        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(getSelfChannel).toHaveBeenCalledTimes(1);
    });

    it('전환 중이면 포그라운드 신호를 무시한다', async () => {
        setVerified(true);
        setSwitching(true);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        const baseline = syncChannels.mock.calls.length;

        await fireForeground();

        expect(syncChannels).toHaveBeenCalledTimes(baseline);
    });

    it('sync 실패 시 해당 워터마크를 전진시키지 않는다', async () => {
        syncChannels.mockRejectedValue(new Error('boom'));
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(setSyncedAt).not.toHaveBeenCalledWith('channel-sync:default', expect.anything());
        expect(syncProfiles).toHaveBeenCalledTimes(1);
    });

    it('사이트(sid) 변경 시 새 사이트 채널을 갱신한다 (auth.switch는 상승 엣지를 만들지 않으므로 Trigger 4)', async () => {
        setVerified(true);
        const { rerender } = renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        syncChannels.mockClear();
        getSelfChannel.mockClear();

        setSession('default', 's2');
        await act(async () => {
            rerender();
        });

        expect(getSelfChannel).toHaveBeenCalled();
        expect(syncChannels).toHaveBeenCalledTimes(1);
    });

    it('클라우드 서버에서는 self 채널을 불러오지 않는다 (렐리 서버 전용)', async () => {
        setVerified(false);
        setSession('cloud-a', 's1');
        const { rerender } = renderHook(() => useBackgroundSync());

        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(getSelfChannel).not.toHaveBeenCalled();
        expect(syncChannels).toHaveBeenCalledTimes(1);
    });

    it('클라우드 전환(상승 엣지 + sid 변경)에서도 self 채널을 불러오지 않는다 (렐리 전용, #7)', async () => {
        setVerified(false);
        setSession('cloud-a', 's1');
        const { rerender } = renderHook(() => useBackgroundSync());

        setVerified(true);
        setSession('cloud-b', 's2');
        await act(async () => {
            rerender();
        });

        expect(getSelfChannel).not.toHaveBeenCalled();
        expect(syncChannels).toHaveBeenCalledTimes(1);
    });

    it('상승 엣지에서 보낸 초대 목록도 함께 갱신한다', async () => {
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());

        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(inviteList).toHaveBeenCalledWith({ limit: 100 });
        expect(inviteList).toHaveBeenCalledTimes(1);
        expect(inviteCacheReadList).not.toHaveBeenCalled();
    });

    it('포그라운드 복귀에서도 초대 목록을 갱신한다', async () => {
        setVerified(true);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        inviteList.mockClear();

        await fireForeground();

        expect(inviteList).toHaveBeenCalledTimes(1);
    });

    it('주기 틱은 살아있는 초대가 없으면 초대 목록을 건너뛴다 — 안 보낸 유저는 0건', async () => {
        jest.useFakeTimers();
        setVerified(true);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        expect(inviteList).toHaveBeenCalledTimes(1);

        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });

        expect(inviteCacheReadList).toHaveBeenCalled();
        expect(inviteList).toHaveBeenCalledTimes(1);
        expect(syncChannels).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
    });

    it.each(['accepted', 'canceled', 'rejected', 'expired'] as const)(
        '주기 틱은 %s만 남은 캐시도 건너뛴다 — 남의 기기에서 더 변할 수 없는 상태다',
        async state => {
            jest.useFakeTimers();
            inviteCacheReadList.mockResolvedValue(cachedInvites(state));
            setVerified(true);
            renderHook(() => useBackgroundSync());
            await act(async () => undefined);

            await act(async () => {
                jest.advanceTimersByTime(60_000);
            });

            expect(inviteList).toHaveBeenCalledTimes(1);
            jest.useRealTimers();
        }
    );

    it('주기 틱은 pending 카드가 캐시에 있으면 초대 목록을 갱신한다 — 수락은 남의 기기에서 일어난다', async () => {
        jest.useFakeTimers();
        inviteCacheReadList.mockResolvedValue(cachedInvites('rejected', 'pending'));
        setVerified(true);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined);

        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });

        expect(inviteList).toHaveBeenCalledTimes(2);
        jest.useRealTimers();
    });

    it('캐시를 못 읽으면 주기 틱은 쏘지 않는다 — 엣지가 어차피 다시 묻는다', async () => {
        jest.useFakeTimers();
        inviteCacheReadList.mockRejectedValue(new Error('boom'));
        setVerified(true);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined);

        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });

        expect(inviteList).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('게스트 세션에서는 초대 목록을 아예 묻지 않는다 — 발급이 메인유저 전용이라 목록이 항상 빈다', async () => {
        (runtime.session.useRuntimeProfile as jest.Mock).mockReturnValue({ isGuest: true });
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());

        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(inviteList).not.toHaveBeenCalled();
        expect(syncChannels).toHaveBeenCalledTimes(1);
    });

    it('클라우드 세션에서는 초대 목록을 갱신하지 않는다 — relay-pinned이고 default 클라우드에서만 렌더된다', async () => {
        setSession('cloud-1', 's1');
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());

        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(inviteList).not.toHaveBeenCalled();
        expect(syncChannels).toHaveBeenCalledTimes(1);
    });

    it('초대 목록 조회 실패가 다른 동기화를 막지 않는다', async () => {
        inviteList.mockRejectedValue(new Error('401 UNAUTHORIZED - not authenticated invite.list'));
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());

        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(syncProfiles).toHaveBeenCalledTimes(1);
    });

    it('전환 진행 중(isSwitching)에는 사이트 변경 트리거가 대기하고, 정착 후 발화한다', async () => {
        setVerified(true);
        setSwitching(true);
        const { rerender } = renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        getSelfChannel.mockClear();

        setSession('default', 's2');
        await act(async () => {
            rerender();
        });
        expect(getSelfChannel).not.toHaveBeenCalled();

        setSwitching(false);
        await act(async () => {
            rerender();
        });
        expect(getSelfChannel).toHaveBeenCalled();
    });
});

describe('useBackgroundSync — 실패 스트릭 통지 (ADR-0099)', () => {
    const fail = syncStreakReporter.fail as jest.Mock;
    const succeed = syncStreakReporter.succeed as jest.Mock;

    const runOnce = async () => {
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        setVerified(true);
        await act(async () => {
            rerender();
        });
    };

    it('모두 성공하면 경로마다 복구를 통지한다', async () => {
        await runOnce();

        const paths = succeed.mock.calls.map(call => call[0]);
        expect(paths).toEqual(
            expect.arrayContaining([
                'place-refresh',
                'my-profile',
                'channel-delta',
                'profile-delta',
                'sent-invites',
                'self-channel',
            ])
        );
        expect(fail).not.toHaveBeenCalled();
    });

    it('채널 델타 동기화가 실패하면 그 경로로 실패를 통지한다', async () => {
        syncChannels.mockRejectedValue(new Error('boom'));

        await runOnce();

        expect(fail).toHaveBeenCalledWith('channel-delta', expect.any(Error));
        expect(succeed.mock.calls.map(call => call[0])).not.toContain('channel-delta');
    });

    it('워터마크 저장이 실패해도 같은 경로의 실패로 센다', async () => {
        setSyncedAt.mockRejectedValue(new Error('cursor write failed'));

        await runOnce();

        expect(fail).toHaveBeenCalledWith('channel-delta', expect.any(Error));
    });

    it('한 경로가 실패해도 다른 경로의 성공은 그대로 통지된다', async () => {
        getMyProfile.mockRejectedValue(new Error('boom'));

        await runOnce();

        expect(fail).toHaveBeenCalledWith('my-profile', expect.any(Error));
        expect(succeed).toHaveBeenCalledWith('channel-delta');
    });

    it('실패해도 재시도 정책은 그대로다 — 예외가 호출부로 새지 않는다', async () => {
        refreshList.mockRejectedValue(new Error('boom'));
        syncProfiles.mockRejectedValue(new Error('boom'));

        await expect(runOnce()).resolves.toBeUndefined();
        expect(fail).toHaveBeenCalledWith('place-refresh', expect.any(Error));
        expect(fail).toHaveBeenCalledWith('profile-delta', expect.any(Error));
    });
});

describe('useBackgroundSync — first channel delta per cloud (useChannelSyncMarkStore)', () => {
    const runOnce = async () => {
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        setVerified(true);
        await act(async () => {
            rerender();
        });
    };

    it('marks the channel delta for the active {cid, uid}', async () => {
        setSession('cloud-A', 's1', 'u9');

        await runOnce();

        expect(useChannelSyncMarkStore.getState().synced).toEqual({ 'cloud-A:u9': true });
    });

    it('marks the relay under its own cid', async () => {
        setSession('default', 's1', 'u9');

        await runOnce();

        expect(useChannelSyncMarkStore.getState().synced['default:u9']).toBe(true);
    });

    it('marks a failed delta too — a device that cannot reach the server must not spin forever', async () => {
        syncChannels.mockRejectedValue(new Error('boom'));
        setSession('cloud-A', 's1', 'u9');

        await runOnce();

        expect(useChannelSyncMarkStore.getState().synced).toEqual({ 'cloud-A:u9': true });
    });

    it('does not mark before the session is verified — nothing was asked yet', async () => {
        setVerified(false);
        setSession('cloud-A', 's1', 'u9');

        renderHook(() => useBackgroundSync());
        await act(async () => undefined);

        expect(useChannelSyncMarkStore.getState().synced).toEqual({});
    });

    it('never marks the place list — a completed refresh cannot testify that a cloud has none', async () => {
        setSession('cloud-A', 's1', 'u9');

        await runOnce();

        expect(refreshList).toHaveBeenCalled();
        expect(Object.keys(useChannelSyncMarkStore.getState().synced)).toEqual(['cloud-A:u9']);
    });
});

describe('useBackgroundSync — on request (pull-to-refresh)', () => {
    const mountSettled = async () => {
        setVerified(true);
        const view = renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        jest.clearAllMocks();
        return view;
    };

    it('runs the full pass, self channel included', async () => {
        await mountSettled();

        await act(async () => requestBackgroundRefresh());

        expect(refreshList).toHaveBeenCalledTimes(1);
        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(syncProfiles).toHaveBeenCalledTimes(1);
        expect(getMyProfile).toHaveBeenCalledTimes(1);
        expect(getSelfChannel).toHaveBeenCalledTimes(1);
    });

    it('settles only once the place snapshot has answered too', async () => {
        await mountSettled();
        let answerPlaces!: () => void;
        refreshList.mockReturnValue(new Promise<void>(resolve => (answerPlaces = resolve)));

        let settled = false;
        await act(async () => {
            void requestBackgroundRefresh().then(() => (settled = true));
        });
        expect(settled).toBe(false);

        await act(async () => answerPlaces());
        expect(settled).toBe(true);
    });

    it('joins a request still running instead of starting a second pass', async () => {
        await mountSettled();
        let answerPlaces!: () => void;
        refreshList.mockReturnValue(new Promise<void>(resolve => (answerPlaces = resolve)));

        let first!: Promise<void>;
        let second!: Promise<void>;
        await act(async () => {
            first = requestBackgroundRefresh();
            second = requestBackgroundRefresh();
        });
        expect(second).toBe(first);
        expect(syncChannels).toHaveBeenCalledTimes(1);

        await act(async () => answerPlaces());
        await act(async () => requestBackgroundRefresh());
        expect(syncChannels).toHaveBeenCalledTimes(2);
    });

    it('asks nothing while the socket is unverified, and still settles', async () => {
        setVerified(false);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined);

        await act(async () => requestBackgroundRefresh());

        expect(refreshList).not.toHaveBeenCalled();
        expect(syncChannels).not.toHaveBeenCalled();
    });

    it('asks nothing mid-switch — the socket may answer for the wrong session', async () => {
        const { rerender } = await mountSettled();
        setSwitching(true);
        rerender();

        await act(async () => requestBackgroundRefresh());

        expect(syncChannels).not.toHaveBeenCalled();
    });

    it('settles at once with no runner mounted', async () => {
        const { unmount } = await mountSettled();
        unmount();

        await expect(requestBackgroundRefresh()).resolves.toBeUndefined();
        expect(syncChannels).not.toHaveBeenCalled();
    });
});
