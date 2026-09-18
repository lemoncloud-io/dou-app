import { act, renderHook } from '@testing-library/react';
import { useIsMutating } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

import { syncStreakReporter } from './logging/syncStreakReporter';
import { useBackgroundSync } from './useBackgroundSync';

jest.mock('@tanstack/react-query', () => ({ useIsMutating: jest.fn() }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            // The key constant the hook uses — mocking the module makes the real export disappear.
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

// Capture the foreground handler so tests can fire the signal directly.
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

/** A sent-invite cache holding rows in the given states (only `state` is read here). */
const cachedInvites = (...states: string[]) => ({
    list: states.map((state, index) => ({ id: `invt-${index}`, state })),
    meta: { total: states.length, source: 'local' as const },
});

const setVerified = (isVerified: boolean) =>
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified });
// The latest registered foreground handler (useAppForeground keeps handlers fresh via ref).
const fireForeground = async () => {
    const handler = (useAppForeground as jest.Mock).mock.calls.at(-1)?.[0];
    await act(async () => {
        handler?.();
    });
};
const setSwitching = (switching: boolean) => (useIsMutating as jest.Mock).mockReturnValue(switching ? 1 : 0);
const setSession = (cid: string, selectedSiteId: string | null) => {
    (runtime.session.useGlobalSession as jest.Mock).mockReturnValue({
        activeServer: cid === 'default' ? { kind: 'relay' } : { kind: 'cloud', cloudId: cid },
    });
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId });
};

beforeEach(() => {
    jest.clearAllMocks();
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
        expect(refreshList).not.toHaveBeenCalled(); // false 유지 중에는 미실행

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

        await act(async () => undefined); // 마운트 상승 엣지 flush
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
        expect(syncChannels).toHaveBeenCalledTimes(afterMount); // 타이머가 호출을 추가하지 않음

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
        // syncProfiles is scoped to the active site — the watermark key is {cid, sid}, so the
        // call must carry the same sid the key was built from.
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

        await act(async () => undefined); // mount rising edge
        expect(getSelfChannel).toHaveBeenCalledTimes(1);

        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });
        // The tick only runs delta syncs; loading the self channel is place-entry-only.
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
        await act(async () => undefined); // flush the mount rising edge
        syncChannels.mockClear();
        getSelfChannel.mockClear();

        await fireForeground();

        // Foreground is not a place entry — only the delta re-syncs; self channel is place-entry-only.
        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(getSelfChannel).not.toHaveBeenCalled();
    });

    it('미인증이면 포그라운드 복귀에서 쏘지 않고, 재인증 상승 엣지(Trigger 1)가 대신 동기화한다', async () => {
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        await act(async () => undefined); // unauthenticated, so no rising edge (Trigger 1) fires
        expect(syncChannels).not.toHaveBeenCalled();

        await fireForeground();
        // Doesn't fire on an unauthenticated socket — avoids a wasted round trip and defers until re-auth
        expect(syncChannels).not.toHaveBeenCalled();
        expect(getSelfChannel).not.toHaveBeenCalled();

        // SDK re-authenticates -> isVerified false->true rising edge, followed by sync
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
        // Mounting with verified+switching fires Trigger 1 (rising edge) once, so that's taken as the baseline.
        await act(async () => undefined);
        const baseline = syncChannels.mock.calls.length;

        await fireForeground();

        expect(syncChannels).toHaveBeenCalledTimes(baseline); // foreground doesn't produce an extra call
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
        // A channel failure does not block profile sync
        expect(syncProfiles).toHaveBeenCalledTimes(1);
    });

    it('사이트(sid) 변경 시 새 사이트 채널을 갱신한다 (auth.switch는 상승 엣지를 만들지 않으므로 Trigger 4)', async () => {
        setVerified(true);
        const { rerender } = renderHook(() => useBackgroundSync());
        await act(async () => undefined); // flush the mount rising edge (s1)
        syncChannels.mockClear();
        getSelfChannel.mockClear();

        // Site switch: s1 -> s2. verified stays true (auth.switch keeps authenticated -> no rising edge).
        setSession('default', 's2');
        await act(async () => {
            rerender();
        });

        expect(getSelfChannel).toHaveBeenCalled();
        expect(syncChannels).toHaveBeenCalledTimes(1);
    });

    it('클라우드 서버에서는 self 채널을 불러오지 않는다 (렐리 서버 전용)', async () => {
        // channel.get-self is a relay-only capability; on a cloud server the fetch is skipped even
        // though a place is selected. The rest of the sync (channel delta) still runs.
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
        // A cloud switch reboots the socket (verified false→true) AND lands on a new sid. Since the
        // target is a cloud server, the self-channel fetch is skipped regardless of trigger fan-out.
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

    /**
     * The sent-invite lane. Home only ever draws from the invite cache (`useRelayInvites`'s `remote`
     * defaults off), and this is the only regular path that fills that cache — the reason it moved
     * here is that home used to fire a relay-pinned `invite.list` on every mount and focus for every
     * user, and that was the packet that surfaced connection-auth desync as a 401.
     */
    it('상승 엣지에서 보낸 초대 목록도 함께 갱신한다', async () => {
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());

        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(inviteList).toHaveBeenCalledWith({ limit: 100 });
        expect(inviteList).toHaveBeenCalledTimes(1);
        // The edge doesn't consult the cache — it's the only place that can discover a card this
        // device has never seen (issued on another device, or after a cache reset), so it fires unconditionally.
        expect(inviteCacheReadList).not.toHaveBeenCalled();
    });

    it('포그라운드 복귀에서도 초대 목록을 갱신한다', async () => {
        setVerified(true);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined); // 마운트 상승 엣지 flush
        inviteList.mockClear();

        await fireForeground();

        expect(inviteList).toHaveBeenCalledTimes(1);
    });

    it('주기 틱은 살아있는 초대가 없으면 초대 목록을 건너뛴다 — 안 보낸 유저는 0건', async () => {
        jest.useFakeTimers();
        setVerified(true);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        expect(inviteList).toHaveBeenCalledTimes(1); // 엣지 1회

        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });

        expect(inviteCacheReadList).toHaveBeenCalled(); // 캐시로 판단하고
        expect(inviteList).toHaveBeenCalledTimes(1); // 패킷은 추가하지 않는다
        expect(syncChannels).toHaveBeenCalledTimes(2); // 다른 도메인은 평소대로 돈다

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
        expect(syncChannels).toHaveBeenCalledTimes(1); // 나머지 레인은 그대로 돈다
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
        expect(syncChannels).toHaveBeenCalledTimes(1); // 나머지 레인은 그대로 돈다
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

        // sid optimistically becomes s2 first, but no fetch happens while still switching.
        setSession('default', 's2');
        await act(async () => {
            rerender();
        });
        expect(getSelfChannel).not.toHaveBeenCalled();

        // Switch settles -> fires.
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

    /** Runs every path through once via a single verified rising edge. */
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

    // The exact path where the watermark doesn't advance — a growing streak is the signal of stagnation.
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
