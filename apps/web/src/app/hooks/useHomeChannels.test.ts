import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession } from '@chatic/web-core';
import type { DomainChannel } from '@chatic/data';

import { useHomeChannels } from './useHomeChannels';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useGlobalSession: jest.fn() }));

const observeListMock = jest.fn();
const refreshListMock = jest.fn();

const setUid = (userId: string | null = 'u1') =>
    (useGlobalSession as jest.Mock).mockReturnValue({ identity: { userId } });

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

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        channel: { observeList: observeListMock, refreshList: refreshListMock },
    });
    setUid('u1');
});

describe('useHomeChannels — 채널 목록 구독', () => {
    it('활성 sid로 캐시를 구독하고, 다른 sid 행은 걸러낸다', () => {
        emit([channel('c1', 's1'), channel('c2', 's2'), channel('c3', 's1')]);

        const { result } = renderHook(() => useHomeChannels('s1'));

        expect(observeListMock).toHaveBeenCalledWith({ sid: 's1' }, expect.any(Function), {
            cid: 'default',
            uid: 'u1',
        });
        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c3']);
        expect(result.current.isLoading).toBe(false);
    });

    it('sid가 없으면 구독하지 않고 빈 목록을 유지한다', () => {
        const { result } = renderHook(() => useHomeChannels(null));

        expect(observeListMock).not.toHaveBeenCalled();
        expect(result.current.channels).toEqual([]);
    });

    it('refreshList를 호출하지 않는다 (목록 발견은 전역 background sync 담당)', () => {
        emit([channel('c1', 's1')]);

        renderHook(() => useHomeChannels('s1'));

        expect(refreshListMock).not.toHaveBeenCalled();
    });

    it('사이트 전환(sid 변경) 시 재구독한다', () => {
        const dispose = emit([channel('c1', 's1')]);

        const { rerender } = renderHook(({ sid }) => useHomeChannels(sid), { initialProps: { sid: 's1' } });
        expect(observeListMock).toHaveBeenCalledTimes(1);

        rerender({ sid: 's2' });

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(observeListMock).toHaveBeenCalledTimes(2);
    });

    it('sid가 그대로여도 uid 변경 시 재구독한다 (클라우드 전환 커밋의 uid 반영)', () => {
        const dispose = emit([channel('c1', 's1')]);
        setUid('old-uid');

        const { rerender } = renderHook(() => useHomeChannels('s1'));
        expect(observeListMock).toHaveBeenCalledTimes(1);

        setUid('new-uid');
        rerender();

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(observeListMock).toHaveBeenCalledTimes(2);
    });

    it('언마운트 시 구독을 해제한다', () => {
        const dispose = emit([channel('c1', 's1')]);

        const { unmount } = renderHook(() => useHomeChannels('s1'));
        unmount();

        expect(dispose).toHaveBeenCalledTimes(1);
    });
});
