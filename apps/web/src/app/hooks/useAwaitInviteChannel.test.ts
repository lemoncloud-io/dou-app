import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

import { useAwaitInviteChannel } from './useAwaitInviteChannel';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useGlobalSession: jest.fn(),
    useSessionSelection: jest.fn(),
}));

const observeListMock = jest.fn();
const cacheReadListMock = jest.fn();
const syncChannelsMock = jest.fn();
const getSyncedAtMock = jest.fn();
const setSyncedAtMock = jest.fn();

/** Latest observeList subscriber, so a test can push a cache emission at will. */
let emitRows: ((rows: DomainChannel[]) => void) | null = null;
let dispose: jest.Mock;

const row = (id: string, stereo = 'dm', sid = 's1'): DomainChannel => ({ id, sid, stereo }) as unknown as DomainChannel;

const setSid = (selectedSiteId: string | null = 's1') =>
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId, selectedCloudId: 'default' });

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    dispose = jest.fn();
    emitRows = null;
    observeListMock.mockImplementation((_query, cb) => {
        emitRows = rows => cb({ list: rows });
        return dispose;
    });
    cacheReadListMock.mockResolvedValue({ list: [row('existing')] });
    syncChannelsMock.mockResolvedValue({ syncedAt: 200 });
    getSyncedAtMock.mockResolvedValue(100);
    setSyncedAtMock.mockResolvedValue(undefined);

    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        channel: {
            observeList: observeListMock,
            cacheReadList: cacheReadListMock,
            syncChannels: syncChannelsMock,
        },
        syncMeta: { getSyncedAt: getSyncedAtMock, setSyncedAt: setSyncedAtMock },
    });
    (useGlobalSession as jest.Mock).mockReturnValue({ identity: { userId: 'u1' }, cloud: { cloudId: 'default' } });
    setSid('s1');
});

afterEach(() => {
    jest.useRealTimers();
});

/** Let the pending microtasks (cache read, sync pull) settle without advancing the clock. */
const flush = async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

describe('useAwaitInviteChannel', () => {
    it('새로 도착한 dm 채널의 id로 resolve한다', async () => {
        const { result } = renderHook(() => useAwaitInviteChannel());

        const pending = result.current.awaitChannel();
        await flush();

        emitRows?.([row('existing'), row('new-dm')]);

        await expect(pending).resolves.toBe('new-dm');
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('원래 있던 채널이나 dm이 아닌 채널은 무시한다', async () => {
        const { result } = renderHook(() => useAwaitInviteChannel());

        const pending = result.current.awaitChannel();
        await flush();

        emitRows?.([row('existing'), row('group-room', 'group'), row('other-place', 'dm', 's2')]);
        await flush();

        jest.advanceTimersByTime(20_000);
        await expect(pending).resolves.toBeNull();
    });

    it('호출부가 준 스냅샷을 기준으로 새 채널을 판정한다 (캐시를 다시 읽지 않는다)', async () => {
        const { result } = renderHook(() => useAwaitInviteChannel());

        const pending = result.current.awaitChannel({ knownChannelIds: ['seen'] });
        await flush();

        expect(cacheReadListMock).not.toHaveBeenCalled();
        emitRows?.([row('seen'), row('fresh')]);

        await expect(pending).resolves.toBe('fresh');
    });

    it('채널이 안 오면 타임아웃에 null로 resolve하고 정리한다 (reject하지 않는다)', async () => {
        const { result } = renderHook(() => useAwaitInviteChannel());

        const pending = result.current.awaitChannel({ timeoutMs: 5_000 });
        await flush();

        jest.advanceTimersByTime(5_000);

        await expect(pending).resolves.toBeNull();
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('대기 중 짧은 주기로 채널 델타를 당기고 워터마크를 전진시킨다', async () => {
        const { result } = renderHook(() => useAwaitInviteChannel());

        const pending = result.current.awaitChannel({ timeoutMs: 10_000, pollMs: 3_000 });
        await flush();

        // The first pull fires immediately rather than waiting out a tick.
        expect(syncChannelsMock).toHaveBeenCalledWith(100);
        expect(setSyncedAtMock).toHaveBeenCalledWith('channel-sync:default', 200);

        jest.advanceTimersByTime(6_000);
        await flush();
        expect(syncChannelsMock).toHaveBeenCalledTimes(3);

        jest.advanceTimersByTime(10_000);
        await pending;

        // No further pulls once settled.
        const settledCalls = syncChannelsMock.mock.calls.length;
        jest.advanceTimersByTime(9_000);
        await flush();
        expect(syncChannelsMock).toHaveBeenCalledTimes(settledCalls);
    });

    it('활성 플레이스가 없으면 구독하지 않고 즉시 null이다', async () => {
        setSid(null);
        const { result } = renderHook(() => useAwaitInviteChannel());

        await expect(result.current.awaitChannel()).resolves.toBeNull();
        expect(observeListMock).not.toHaveBeenCalled();
    });

    it('홈 목록과 같은 스코프로 구독한다', async () => {
        const { result } = renderHook(() => useAwaitInviteChannel());

        const pending = result.current.awaitChannel({ timeoutMs: 1_000 });
        await flush();

        expect(observeListMock).toHaveBeenCalledWith({ sid: 's1' }, expect.any(Function), {
            cid: 'default',
            uid: 'u1',
        });

        jest.advanceTimersByTime(1_000);
        await pending;
    });
});
