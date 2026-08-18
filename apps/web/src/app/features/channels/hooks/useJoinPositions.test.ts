import { renderHook } from '@testing-library/react';

import { getSyncManager, useRuntimeSocketState } from '@chatic/app-runtime';

import { useJoinPositions } from './useJoinPositions';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeSocketState: jest.fn(),
    getSyncManager: jest.fn(),
}));

const registerJoin = jest.fn(() => () => undefined);

/** 커서 맵은 이제 useChannelJoins가 만든다 — 이 훅은 그 결과를 받아 등록과 카운트만 한다. */
const cursors = (entries: Record<string, number>) => new Map(Object.entries(entries));

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (getSyncManager as jest.Mock).mockReturnValue({ registerJoin });
});

describe('useJoinPositions — 읽음 커서/안읽음 계산', () => {
    it('전체 멤버(memberIds)에 대해 join sync를 등록한다 — join 캐시는 관측하지 않는다', () => {
        // active(분모)는 u1/u2지만, 등록은 전체 로스터(u1/u2/u3) 기준으로 이뤄진다.
        renderHook(() => useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2', 'u3'], cursors({})));

        expect(registerJoin).toHaveBeenCalledTimes(3);
        expect(registerJoin).toHaveBeenCalledWith('c1@u1');
        expect(registerJoin).toHaveBeenCalledWith('c1@u2');
        expect(registerJoin).toHaveBeenCalledWith('c1@u3');
    });

    it('세션 미검증(isVerified=false)이면 join sync를 등록하지 않는다', () => {
        (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });

        renderHook(() => useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2'], cursors({})));

        expect(registerJoin).not.toHaveBeenCalled();
    });

    it('로스터가 그대로면 재등록하지 않는다 (커서만 바뀌는 흔한 경우)', () => {
        const { rerender } = renderHook(({ byUser }) => useJoinPositions('c1', ['u1'], ['u1'], byUser), {
            initialProps: { byUser: cursors({ u1: 1 }) },
        });
        expect(registerJoin).toHaveBeenCalledTimes(1);

        // 새 Map 신원이지만 로스터는 동일 — 등록 효과는 memberKey로만 다시 돈다.
        rerender({ byUser: cursors({ u1: 7 }) });

        expect(registerJoin).toHaveBeenCalledTimes(1);
    });

    it('커서는 넘겨받은 max(readNo, chatNo) 맵을 그대로 쓴다', () => {
        // u1은 5까지, u2는 4까지 읽은 상태.
        const { result } = renderHook(() =>
            useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2'], cursors({ u1: 5, u2: 4 }))
        );

        // chatNo 5까지 읽은 사람: u1(5) → 1명, u2(4)는 미달
        expect(result.current.getReadCount(5)).toEqual({ readCount: 1, unreadCount: 1 });
        // chatNo 4까지: u1(5), u2(4) → 2명
        expect(result.current.getReadCount(4)).toEqual({ readCount: 2, unreadCount: 0 });
    });

    it('분모는 active 멤버 수와 일치한다', () => {
        const { result } = renderHook(() =>
            useJoinPositions('c1', ['u1', 'u2', 'u3'], ['u1', 'u2', 'u3'], cursors({ u1: 10 }))
        );

        // u1만 읽음, 분모 3 → 안읽음 2
        expect(result.current.getReadCount(10)).toEqual({ readCount: 1, unreadCount: 2 });
    });

    it('커서가 낮아진 맵을 받으면 그대로 내려간다 (high-water 없음)', () => {
        const { result, rerender } = renderHook(({ byUser }) => useJoinPositions('c1', ['u1'], ['u1'], byUser), {
            initialProps: { byUser: cursors({ u1: 9 }) },
        });
        expect(result.current.getReadCount(9).readCount).toBe(1);

        rerender({ byUser: cursors({ u1: 2 }) });

        expect(result.current.getReadCount(9).readCount).toBe(0);
    });

    // 커서가 하나도 없으면(아직 join이 안 온 상태) 읽음 표시를 그릴 수 없다.
    it('isReady는 active 멤버와 커서가 모두 있을 때만 참이다', () => {
        const { result: empty } = renderHook(() => useJoinPositions('c1', ['u1'], ['u1'], cursors({})));
        expect(empty.current.isReady).toBe(false);

        const { result: ready } = renderHook(() => useJoinPositions('c1', ['u1'], ['u1'], cursors({ u1: 3 })));
        expect(ready.current.isReady).toBe(true);
    });
});
