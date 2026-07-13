import { act, renderHook } from '@testing-library/react';
import { useIsMutating } from '@tanstack/react-query';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/web-core';

import { useBackgroundSync } from './useBackgroundSync';

jest.mock('@tanstack/react-query', () => ({ useIsMutating: jest.fn() }));
jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn(), useSocketState: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useGlobalSession: jest.fn(),
    useSessionSelection: jest.fn(),
    // The hook imports these key constants; mocking the module drops the real exports.
    SWITCH_SITE_MUTATION_KEY: ['session', 'switch-site'],
    SWITCH_CLOUD_MUTATION_KEY: ['session', 'switch-cloud'],
}));
// Capture the foreground handler so tests can fire the signal directly.
jest.mock('../bridge', () => ({ useAppForeground: jest.fn() }));

import { useAppForeground } from '../bridge';

const refreshList = jest.fn();
const refreshChannelList = jest.fn();
const syncChannels = jest.fn();
const syncProfiles = jest.fn();
const getMyProfile = jest.fn();
const getSyncedAt = jest.fn();
const setSyncedAt = jest.fn();

const setVerified = (isVerified: boolean) => (useSocketState as jest.Mock).mockReturnValue({ isVerified });
// The latest registered foreground handler (useAppForeground keeps handlers fresh via ref).
const fireForeground = async () => {
    const handler = (useAppForeground as jest.Mock).mock.calls.at(-1)?.[0];
    await act(async () => {
        handler?.();
    });
};
const setSwitching = (switching: boolean) => (useIsMutating as jest.Mock).mockReturnValue(switching ? 1 : 0);
const setSession = (cid: string, selectedSiteId: string | null) => {
    (useGlobalSession as jest.Mock).mockReturnValue({
        activeServer: cid === 'default' ? { kind: 'relay' } : { kind: 'cloud', cloudId: cid },
    });
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId });
};

beforeEach(() => {
    jest.clearAllMocks();
    refreshList.mockResolvedValue(undefined);
    refreshChannelList.mockResolvedValue(undefined);
    syncChannels.mockResolvedValue({ syncedAt: 100 });
    syncProfiles.mockResolvedValue({ syncedAt: 200 });
    getSyncedAt.mockResolvedValue(0);
    setSyncedAt.mockResolvedValue(undefined);
    getMyProfile.mockResolvedValue(undefined);
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        place: { refreshList },
        channel: { refreshList: refreshChannelList, syncChannels },
        profile: { syncProfiles },
        user: { getMyProfile },
        syncMeta: { getSyncedAt, setSyncedAt },
    });
    setSwitching(false);
    setSession('default', 's1');
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
        expect(syncProfiles).toHaveBeenCalledWith(50);
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

    it('verified 상승 엣지에서 활성 사이트 채널 스냅샷을 1회 풀 리프레시한다', async () => {
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        expect(refreshChannelList).not.toHaveBeenCalled();

        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(refreshChannelList).toHaveBeenCalledTimes(1);
        expect(refreshChannelList).toHaveBeenCalledWith({ sid: 's1', detail: true, limit: 100 });
    });

    it('주기 타이머 틱에서는 채널 풀 리프레시를 실행하지 않는다', async () => {
        jest.useFakeTimers();
        setVerified(true);
        renderHook(() => useBackgroundSync());

        await act(async () => undefined); // mount rising edge
        expect(refreshChannelList).toHaveBeenCalledTimes(1);

        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });
        // The tick only runs delta syncs; the snapshot stays a rising-edge-only fetch.
        expect(refreshChannelList).toHaveBeenCalledTimes(1);
        expect(syncChannels).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
    });

    it('활성 사이트가 없으면 채널 풀 리프레시를 건너뛴다', async () => {
        setSession('default', null);
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(refreshChannelList).not.toHaveBeenCalled();
    });

    it('채널 풀 리프레시 실패가 다른 동기화를 막지 않는다', async () => {
        refreshChannelList.mockRejectedValue(new Error('boom'));
        setVerified(false);
        const { rerender } = renderHook(() => useBackgroundSync());
        setVerified(true);
        await act(async () => {
            rerender();
        });

        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(syncProfiles).toHaveBeenCalledTimes(1);
    });

    it('포그라운드 복귀 신호에서 목록 델타 + 채널 스냅샷을 갱신한다', async () => {
        setVerified(true);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined); // flush the mount rising edge
        syncChannels.mockClear();
        refreshChannelList.mockClear();

        await fireForeground();

        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(refreshChannelList).toHaveBeenCalledTimes(1);
    });

    it('미인증이어도 포그라운드 복귀에서 동기화한다 — 요청 계층이 401/재연결을 자가치유', async () => {
        setVerified(false);
        renderHook(() => useBackgroundSync());
        await act(async () => undefined); // 미인증이라 상승 엣지(Trigger 1) 미발생
        expect(syncChannels).not.toHaveBeenCalled();

        await fireForeground();

        expect(syncChannels).toHaveBeenCalledTimes(1);
        expect(refreshChannelList).toHaveBeenCalledTimes(1);
    });

    it('전환 중이면 포그라운드 신호를 무시한다', async () => {
        setVerified(true);
        setSwitching(true);
        renderHook(() => useBackgroundSync());
        // verified+switching로 마운트하면 Trigger 1(상승 엣지)이 1회 발생하므로 baseline으로 잡는다.
        await act(async () => undefined);
        const baseline = syncChannels.mock.calls.length;

        await fireForeground();

        expect(syncChannels).toHaveBeenCalledTimes(baseline); // 포그라운드가 추가 호출을 만들지 않음
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
        // 채널 실패가 프로필 동기화를 막지는 않는다
        expect(syncProfiles).toHaveBeenCalledTimes(1);
    });

    it('사이트(sid) 변경 시 새 사이트 채널을 갱신한다 (auth.switch는 상승 엣지를 만들지 않으므로 Trigger 4)', async () => {
        setVerified(true);
        const { rerender } = renderHook(() => useBackgroundSync());
        await act(async () => undefined); // 마운트 상승 엣지(s1) flush
        syncChannels.mockClear();
        refreshChannelList.mockClear();

        // 사이트 전환: s1 → s2. verified는 그대로 true(auth.switch가 authenticated 유지 → 상승 엣지 없음).
        setSession('default', 's2');
        await act(async () => {
            rerender();
        });

        expect(refreshChannelList).toHaveBeenCalledWith({ sid: 's2', detail: true, limit: 100 });
        expect(syncChannels).toHaveBeenCalledTimes(1);
    });

    it('전환 진행 중(isSwitching)에는 사이트 변경 트리거가 대기하고, 정착 후 발화한다', async () => {
        setVerified(true);
        setSwitching(true);
        const { rerender } = renderHook(() => useBackgroundSync());
        await act(async () => undefined);
        refreshChannelList.mockClear();

        // sid는 낙관적으로 먼저 s2가 되지만 아직 전환 중이므로 fetch하지 않는다.
        setSession('default', 's2');
        await act(async () => {
            rerender();
        });
        expect(refreshChannelList).not.toHaveBeenCalled();

        // 전환 정착 → 발화.
        setSwitching(false);
        await act(async () => {
            rerender();
        });
        expect(refreshChannelList).toHaveBeenCalledWith({ sid: 's2', detail: true, limit: 100 });
    });
});
