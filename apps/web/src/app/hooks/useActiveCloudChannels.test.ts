import { createElement, type ReactNode } from 'react';

import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

import { useChannelSyncMarkStore } from '../stores/useChannelSyncMarkStore';
import { COLD_LIST_WINDOW_MS } from './useColdListWindow';
import { ActiveCloudDataContext } from './activeCloudDataContext';
import { useActiveCloudChannels, useActiveCloudChannelsSource } from './useActiveCloudChannels';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        session: {
            useGlobalSession: jest.fn(),
            useSessionSelection: jest.fn(),
        },
    },
}));

const observeListMock = jest.fn();

const channel = (id: string, sid: string): DomainChannel => ({ id, sid }) as unknown as DomainChannel;

// Wire observeList to immediately emit the given rows and return a disposer spy.
const emit = (rows: DomainChannel[]) => {
    const dispose = jest.fn();
    observeListMock.mockImplementation((_query, cb) => {
        cb({ list: rows });
        return dispose;
    });
    return dispose;
};

const setSelection = (selectedCloudId: string, selectedSiteId: string | null = null) =>
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId, selectedSiteId });

const setUid = (userId: string | null = 'u1') =>
    (runtime.session.useGlobalSession as jest.Mock).mockReturnValue({ identity: { userId } });

beforeEach(() => {
    jest.clearAllMocks();
    // No cloud has been answered by the server yet — the cold state every test starts from.
    useChannelSyncMarkStore.setState({ synced: {} });
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ channel: { observeList: observeListMock } });
    setSelection('cloud-A');
    setUid('u1');
});

describe('useActiveCloudChannelsSource — 클라우드 전체 채널 구독', () => {
    it('빈 sid로 클라우드 전체 채널을 구독하고 {cid, uid} 스코프로 고정한다', () => {
        emit([channel('c1', 's1'), channel('c2', 's2')]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        // The {cid, uid} override pins the observer scope independent of the provider commit lag.
        expect(observeListMock).toHaveBeenCalledWith({ sid: '' }, expect.any(Function), { cid: 'cloud-A', uid: 'u1' });
        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c2']);
    });

    it('사이트 전환(sid 변경)에는 재구독하지 않는다 (cloud-wide 집합은 사이트 무관)', () => {
        const dispose = emit([channel('c1', 's1')]);
        setSelection('cloud-A', 's1');

        const { result, rerender } = renderHook(() => useActiveCloudChannelsSource());
        expect(result.current.channels.map(c => c.id)).toEqual(['c1']);

        // Same {cid, uid} scope across a site switch → no re-subscribe, no clear. The observer keeps
        // matching cloud-wide writes without re-keying on the active sid.
        setSelection('cloud-A', 's2');
        rerender();

        expect(dispose).not.toHaveBeenCalled();
        expect(result.current.channels.map(c => c.id)).toEqual(['c1']);
    });

    it('클라우드 변경 시 이전 목록을 비우고 재구독한다', () => {
        const disposeA = emit([channel('a1', 's1')]);
        setSelection('cloud-A');

        const { result, rerender } = renderHook(() => useActiveCloudChannelsSource());
        expect(result.current.channels.map(c => c.id)).toEqual(['a1']);

        const disposeB = emit([channel('b1', 's9')]);
        setSelection('cloud-B');
        rerender();

        expect(disposeA).toHaveBeenCalledTimes(1);
        expect(result.current.channels.map(c => c.id)).toEqual(['b1']);
        expect(disposeB).not.toHaveBeenCalled();
    });

    it('cid가 그대로여도 uid 변경 시 재구독한다 (클라우드 전환 커밋의 uid 반영)', () => {
        // The cloud-switch commit flips uid while selectedCloudId is already the target cloud, so
        // uid must drive re-subscription — otherwise the post-commit fetch reemit is missed.
        const disposeOldUid = emit([channel('stale', 's1')]);
        setSelection('cloud-A');
        setUid('old-uid');

        const { result, rerender } = renderHook(() => useActiveCloudChannelsSource());
        expect(result.current.channels.map(c => c.id)).toEqual(['stale']);

        const disposeNewUid = emit([channel('fresh', 's1')]);
        setUid('new-uid');
        rerender();

        expect(disposeOldUid).toHaveBeenCalledTimes(1);
        expect(result.current.channels.map(c => c.id)).toEqual(['fresh']);
        expect(disposeNewUid).not.toHaveBeenCalled();
    });
});

// Channels of a site that became unreachable (a place gone from the rail) stay in the cache. That
// channel shows up in neither the home list nor a place dot, yet it's still counted in total, so an
// unreadable unread stayed on the app badge forever.
describe('useActiveCloudChannelsSource — 닿을 수 없는 place 제외', () => {
    const placeObserveList = jest.fn();

    const emitPlaces = (ids: (string | undefined)[]) =>
        placeObserveList.mockImplementation((_query, cb) => {
            cb({ list: ids.map(id => ({ id })) });
            return jest.fn();
        });

    beforeEach(() => {
        (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
            channel: { observeList: observeListMock },
            place: { observeList: placeObserveList },
        });
    });

    it('레일에 없는 place의 채널을 뺀다', () => {
        emitPlaces(['site-1']);
        emit([channel('c1', 'site-1'), channel('c2', 'site-gone')]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.channels.map(c => c.id)).toEqual(['c1']);
    });

    it('레일에 있는 place의 채널은 모두 남긴다 — 활성 사이트가 아니어도', () => {
        emitPlaces(['site-1', 'site-2']);
        emit([channel('c1', 'site-1'), channel('c2', 'site-2')]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c2']);
    });

    // Reading a not-yet-arrived place list as "no places" would flash the badge to 0 on every cloud
    // switch. Don't filter while it's still unknown.
    it('place 목록이 아직 없으면 거르지 않는다', () => {
        placeObserveList.mockImplementation(() => jest.fn());
        emit([channel('c1', 'site-1'), channel('c2', 'site-gone')]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c2']);
    });

    // A row with no sid attached yet is not an orphan — it's a row still syncing.
    it('sid가 없는 채널은 남긴다', () => {
        emitPlaces(['site-1']);
        emit([channel('c1', 'site-1'), { id: 'c2' } as DomainChannel]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c2']);
    });
});

// A cloud this device has never opened answers from the cache instantly, with nothing — which is not
// an answer about the cloud. Reading it as loaded flashed "no rooms" over a cloud still being fetched.
describe('useActiveCloudChannelsSource — cold cloud loading gate', () => {
    it('is not loaded while the cache answers empty and no delta has landed', () => {
        emit([]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.channels).toEqual([]);
        expect(result.current.isLoaded).toBe(false);
    });

    it('becomes loaded once that cloud channel delta has been answered', () => {
        emit([]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());
        expect(result.current.isLoaded).toBe(false);

        // A place that really has no rooms settles here, within one round trip — that is the common
        // case (every place starts empty), which is why this does not wait out the window.
        act(() => useChannelSyncMarkStore.getState().markSynced('cloud-A', 'u1'));

        expect(result.current.isLoaded).toBe(true);
    });

    it('ignores a delta answered for another cloud', () => {
        emit([]);
        useChannelSyncMarkStore.getState().markSynced('cloud-other', 'u1');

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.isLoaded).toBe(false);
    });

    it('gives up waiting once the window elapses, so the section is never stuck', () => {
        // No delta will ever answer on a device that cannot reach the server; the wait still ends.
        jest.useFakeTimers();
        emit([]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());
        expect(result.current.isLoaded).toBe(false);

        act(() => {
            jest.advanceTimersByTime(COLD_LIST_WINDOW_MS);
        });

        expect(result.current.isLoaded).toBe(true);
        jest.useRealTimers();
    });

    it('is loaded straight off a cache that holds rows (warm cloud, no delta needed)', () => {
        emit([channel('c1', 's1')]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.isLoaded).toBe(true);
    });
});

// The thin hook only reads the result of the shared observation (ActiveCloudDataProvider) — it does not create its own subscription.
describe('useActiveCloudChannels — 공유 관측 읽기', () => {
    const wrapper =
        (value: { channels: DomainChannel[] }) =>
        ({ children }: { children: ReactNode }) =>
            createElement(ActiveCloudDataContext.Provider, { value: value as never }, children);

    it('컨텍스트의 채널을 그대로 돌려주고 observeList를 부르지 않는다', () => {
        const rows = [channel('c1', 's1')];

        const { result } = renderHook(() => useActiveCloudChannels(), { wrapper: wrapper({ channels: rows }) });

        expect(result.current).toBe(rows);
        expect(observeListMock).not.toHaveBeenCalled();
    });

    it('프로바이더가 없으면 조용히 비어 있지 않고 던진다', () => {
        // A silent fallback would bring back the duplicate subscriptions this context was meant to remove; a silent empty value would leave the badge permanently at 0.
        expect(() => renderHook(() => useActiveCloudChannels())).toThrow(/ActiveCloudDataProvider is missing/);
    });
});
