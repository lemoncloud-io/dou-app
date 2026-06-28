import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession } from '@chatic/web-core';
import type { DomainPlace } from '@chatic/data';

import { useHomePlaces } from './useHomePlaces';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useGlobalSession: jest.fn() }));

const observeListMock = jest.fn();
const refreshListMock = jest.fn();

const place = (id: string): DomainPlace => ({ id }) as unknown as DomainPlace;

// Wire observeList to immediately emit the given rows and return a disposer spy.
const emit = (rows: DomainPlace[]) => {
    const dispose = jest.fn();
    observeListMock.mockImplementation((_query, cb) => {
        cb({ list: rows });
        return dispose;
    });
    return dispose;
};

const setActiveServer = (kind: 'relay' | 'cloud', cloudId?: string) =>
    (useGlobalSession as jest.Mock).mockReturnValue({
        activeServer: kind === 'cloud' ? { kind, cloudId } : { kind },
    });

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        place: { observeList: observeListMock, refreshList: refreshListMock },
    });
    setActiveServer('relay');
});

describe('useHomePlaces — 플레이스 목록 구독', () => {
    it('캐시를 구독해 목록을 노출하고 로딩을 해제한다', () => {
        emit([place('p1'), place('p2')]);

        const { result } = renderHook(() => useHomePlaces());

        expect(observeListMock).toHaveBeenCalledWith(undefined, expect.any(Function));
        expect(result.current.places.map(p => p.id)).toEqual(['p1', 'p2']);
        expect(result.current.isLoading).toBe(false);
    });

    it('refreshList를 호출하지 않는다 (목록 발견은 전역 background sync 담당)', () => {
        emit([place('p1')]);

        renderHook(() => useHomePlaces());

        expect(refreshListMock).not.toHaveBeenCalled();
    });

    it('클라우드(cid) 변경 시 재구독하고 이전 클라우드 행을 폐기한다', () => {
        const disposeA = emit([place('a1')]);
        setActiveServer('cloud', 'cloud-A');

        const { result, rerender } = renderHook(() => useHomePlaces());
        expect(result.current.places.map(p => p.id)).toEqual(['a1']);

        const disposeB = emit([place('b1')]);
        setActiveServer('cloud', 'cloud-B');
        rerender();

        // The prior cloud's subscription is torn down and the new rows replace the old ones.
        expect(disposeA).toHaveBeenCalledTimes(1);
        expect(result.current.places.map(p => p.id)).toEqual(['b1']);
        expect(disposeB).not.toHaveBeenCalled();
    });
});
