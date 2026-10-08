import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainPlace } from '@chatic/data';

import { COLD_LIST_WINDOW_MS } from './useColdListWindow';
import { useActiveCloudPlaces } from './useActiveCloudPlaces';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        session: {
            useGlobalSession: jest.fn(),
        },
    },
}));

const observeListMock = jest.fn();
const refreshListMock = jest.fn();

const place = (id: string): DomainPlace => ({ id }) as unknown as DomainPlace;

// Wire observeList to immediately emit the given rows and return a disposer spy. Each row is stamped
// with the cid of the scope it was observed under, as a cache row of that partition carries, unless
// the case gives it one of its own.
const emit = (rows: DomainPlace[]) => {
    const dispose = jest.fn();
    observeListMock.mockImplementation((_query, cb, scope?: { cid?: string }) => {
        cb({ list: rows.map(row => ({ cid: scope?.cid, ...row })) });
        return dispose;
    });
    return dispose;
};

const setActiveServer = (kind: 'relay' | 'cloud', cloudId?: string, userId: string | null = 'u1') =>
    (runtime.session.useGlobalSession as jest.Mock).mockReturnValue({
        activeServer: kind === 'cloud' ? { kind, cloudId } : { kind },
        // useActiveCloudPlaces keys its cache-scope cid on the OPTIMISTIC selected cloud (session.cloud.cloudId),
        // not the committed activeServer.cloudId — mirror that here.
        cloud: kind === 'cloud' ? { cloudId } : undefined,
        identity: { userId },
    });

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        place: { observeList: observeListMock, refreshList: refreshListMock },
    });
    setActiveServer('relay');
});

describe('useActiveCloudPlaces — observing the place list', () => {
    it("never hands out the previous cloud's rows, not even in the render where the selection moves", () => {
        // With a background session per cloud, the incoming cloud's socket is already up: a row
        // rendered in that render registers its place under the new cloud, and the auto-select
        // switches to it. The observer reset runs in an effect, one render too late for both.
        setActiveServer('cloud', 'cloud-A', 'u1');
        emit([place('a1')]);
        const seen: Array<{ ids: string[]; isLoading: boolean }> = [];
        const { rerender } = renderHook(() => {
            const result = useActiveCloudPlaces();
            seen.push({ ids: result.places.map(p => p.id), isLoading: result.isLoading });
            return result;
        });
        expect(seen.at(-1)?.ids).toEqual(['a1']);
        const before = seen.length;

        setActiveServer('cloud', 'cloud-B', 'u1');
        emit([]);
        rerender();

        const afterSwitch = seen.slice(before);
        expect(afterSwitch.length).toBeGreaterThan(0);
        expect(afterSwitch.every(render => !render.ids.includes('a1'))).toBe(true);
        // …and the empty list in between reads as loading, not as a cloud without places.
        expect(afterSwitch.every(render => render.isLoading)).toBe(true);
    });

    it('캐시를 구독해 목록을 노출하고 로딩을 해제한다', () => {
        emit([place('p1'), place('p2')]);

        const { result } = renderHook(() => useActiveCloudPlaces());

        // The {cid, uid} override pins the observer scope to the target cloud (relay → 'default').
        expect(observeListMock).toHaveBeenCalledWith(undefined, expect.any(Function), { cid: 'default', uid: 'u1' });
        expect(result.current.places.map(p => p.id)).toEqual(['p1', 'p2']);
        expect(result.current.isLoading).toBe(false);
    });

    it('관찰자 스코프를 대상 클라우드의 {cid, uid}로 고정한다 (provider 커밋 지연 무관)', () => {
        emit([place('a1')]);
        setActiveServer('cloud', 'cloud-A', 'u9');

        renderHook(() => useActiveCloudPlaces());

        expect(observeListMock).toHaveBeenCalledWith(undefined, expect.any(Function), { cid: 'cloud-A', uid: 'u9' });
    });

    it('refreshList를 호출하지 않는다 (목록 발견은 전역 background sync 담당)', () => {
        emit([place('p1')]);

        renderHook(() => useActiveCloudPlaces());

        expect(refreshListMock).not.toHaveBeenCalled();
    });

    it('클라우드(cid) 변경 시 재구독하고 이전 클라우드 행을 폐기한다', () => {
        const disposeA = emit([place('a1')]);
        setActiveServer('cloud', 'cloud-A');

        const { result, rerender } = renderHook(() => useActiveCloudPlaces());
        expect(result.current.places.map(p => p.id)).toEqual(['a1']);

        const disposeB = emit([place('b1')]);
        setActiveServer('cloud', 'cloud-B');
        rerender();

        // The prior cloud's subscription is torn down and the new rows replace the old ones.
        expect(disposeA).toHaveBeenCalledTimes(1);
        expect(result.current.places.map(p => p.id)).toEqual(['b1']);
        expect(disposeB).not.toHaveBeenCalled();
    });

    it('cid가 그대로여도 uid 변경 시 재구독한다 (클라우드 전환 커밋의 uid 반영)', () => {
        // Reproduces the cloud-switch bug: cid is pre-applied optimistically, then uid flips at
        // token commit while cid stays the same. Keying on cid alone would leave the observer
        // orphaned under the pre-commit uid, so the post-commit rows must arrive via a re-subscribe.
        const disposeOldUid = emit([place('stale')]);
        setActiveServer('cloud', 'cloud-A', 'old-uid');

        const { result, rerender } = renderHook(() => useActiveCloudPlaces());
        expect(result.current.places.map(p => p.id)).toEqual(['stale']);

        const disposeNewUid = emit([place('fresh')]);
        setActiveServer('cloud', 'cloud-A', 'new-uid');
        rerender();

        expect(disposeOldUid).toHaveBeenCalledTimes(1);
        expect(result.current.places.map(p => p.id)).toEqual(['fresh']);
        expect(disposeNewUid).not.toHaveBeenCalled();
    });

    describe('cold cloud — an empty cache is not an empty cloud', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('stays loading while the cache answers empty and the window is still open', () => {
            // What a cloud this device has never opened looks like: the cache answers instantly,
            // with nothing, before `place.refreshList` has even been sent.
            emit([]);
            setActiveServer('cloud', 'cloud-cold', 'u1');

            const { result } = renderHook(() => useActiveCloudPlaces());

            expect(result.current.places).toEqual([]);
            expect(result.current.isLoading).toBe(true);
        });

        it('stops loading as soon as rows arrive — rows are the only real answer here', () => {
            // The cold emit first, then the snapshot landing in the cache re-emits through the same
            // observer — no re-subscribe, which is exactly how the real refresh reaches this hook.
            emit([]);
            setActiveServer('cloud', 'cloud-cold', 'u1');

            const { result } = renderHook(() => useActiveCloudPlaces());
            expect(result.current.isLoading).toBe(true);

            const onEmit = observeListMock.mock.calls.at(-1)?.[1] as (r: { list: DomainPlace[] }) => void;
            act(() => onEmit({ list: [{ ...place('p1'), cid: 'cloud-cold' }] }));

            expect(result.current.places.map(p => p.id)).toEqual(['p1']);
            expect(result.current.isLoading).toBe(false);
        });

        it('gives up waiting once the window elapses, so the screen is never stuck', () => {
            // A cloud that really has no places, or a device that never reached the server. Either
            // way the wait has to end — `PlaceRepository` never writes an empty snapshot, so no
            // answer is coming that says "none".
            emit([]);
            setActiveServer('cloud', 'cloud-cold', 'u1');

            const { result } = renderHook(() => useActiveCloudPlaces());
            expect(result.current.isLoading).toBe(true);

            act(() => {
                jest.advanceTimersByTime(COLD_LIST_WINDOW_MS);
            });

            expect(result.current.isLoading).toBe(false);
        });

        it('does not wait at all when the cache already holds rows', () => {
            // The warm path — re-entering a cloud visited before must not regress into a skeleton.
            emit([place('p1')]);
            setActiveServer('cloud', 'cloud-warm', 'u1');

            const { result } = renderHook(() => useActiveCloudPlaces());

            expect(result.current.isLoading).toBe(false);
        });
    });
});
