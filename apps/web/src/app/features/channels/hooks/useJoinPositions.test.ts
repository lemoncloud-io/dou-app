import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useJoinPositions } from './useJoinPositions';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: {
            useRuntimeSocketState: jest.fn(),
        },
        sync: {
            getSyncManager: jest.fn(),
        },
        session: {
            useGlobalSession: jest.fn(() => ({ identity: { userId: 'me' } })),
        },
    },
}));

const registerJoin = jest.fn(() => () => undefined);

/** The cursor map is now built by useChannelJoins — this hook just takes that result and handles registration and counting. */
const cursors = (entries: Record<string, number>) => new Map(Object.entries(entries));

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (runtime.sync.getSyncManager as jest.Mock).mockReturnValue({ registerJoin });
});

describe('useJoinPositions — 읽음 커서/안읽음 계산', () => {
    it('전체 멤버(memberIds)에 대해 join sync를 등록한다 — join 캐시는 관측하지 않는다', () => {
        // active (the denominator) is u1/u2, but registration happens against the full roster (u1/u2/u3).
        renderHook(() => useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2', 'u3'], cursors({}), true));

        expect(registerJoin).toHaveBeenCalledTimes(3);
        expect(registerJoin).toHaveBeenCalledWith('c1@u1');
        expect(registerJoin).toHaveBeenCalledWith('c1@u2');
        expect(registerJoin).toHaveBeenCalledWith('c1@u3');
    });

    // The server only returns someone else's join to a member of that channel. Polling the
    // roster from a room you're not a member of (e.g. landing in someone else's self-chat via a
    // push) fires a 403 and a server alarm for every member — an alarm that actually happened.
    it('멤버가 아니면(isMember=false) 로스터 폴링을 등록하지 않는다', () => {
        renderHook(() => useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2', 'me'], cursors({}), false));

        expect(registerJoin).not.toHaveBeenCalled();
    });

    // Membership can only be determined once the channel row and my join row have arrived.
    // Registration is deferred until then, and happens as soon as the determination is made.
    it('멤버 판정이 false→true로 바뀌면 그때 등록한다', () => {
        const { rerender } = renderHook(
            ({ isMember }) => useJoinPositions('c1', ['u1'], ['u1', 'me'], cursors({}), isMember),
            { initialProps: { isMember: false } }
        );
        expect(registerJoin).not.toHaveBeenCalled();

        rerender({ isMember: true });

        expect(registerJoin).toHaveBeenCalledTimes(2);
        expect(registerJoin).toHaveBeenCalledWith('c1@u1');
        expect(registerJoin).toHaveBeenCalledWith('c1@me');
    });

    it('세션 미검증(isVerified=false)이면 join sync를 등록하지 않는다', () => {
        (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });

        renderHook(() => useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2'], cursors({}), true));

        expect(registerJoin).not.toHaveBeenCalled();
    });

    it('로스터가 그대로면 재등록하지 않는다 (커서만 바뀌는 흔한 경우)', () => {
        const { rerender } = renderHook(({ byUser }) => useJoinPositions('c1', ['u1'], ['u1'], byUser, true), {
            initialProps: { byUser: cursors({ u1: 1 }) },
        });
        expect(registerJoin).toHaveBeenCalledTimes(1);

        // A new Map identity but the same roster — the registration effect only re-runs on memberKey.
        rerender({ byUser: cursors({ u1: 7 }) });

        expect(registerJoin).toHaveBeenCalledTimes(1);
    });

    it('커서는 넘겨받은 max(readNo, chatNo) 맵을 그대로 쓴다', () => {
        // u1 has read up to 5, u2 up to 4.
        const { result } = renderHook(() =>
            useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2'], cursors({ u1: 5, u2: 4 }), true)
        );

        // People who read up to chatNo 5: u1(5) → 1 person, u2(4) falls short
        expect(result.current.getReadCount(5)).toEqual({ readCount: 1, unreadCount: 1 });
        // up to chatNo 4: u1(5), u2(4) → 2 people
        expect(result.current.getReadCount(4)).toEqual({ readCount: 2, unreadCount: 0 });
    });

    it('분모는 active 멤버 수와 일치한다', () => {
        const { result } = renderHook(() =>
            useJoinPositions('c1', ['u1', 'u2', 'u3'], ['u1', 'u2', 'u3'], cursors({ u1: 10 }), true)
        );

        // Only u1 has read, denominator 3 → unread 2
        expect(result.current.getReadCount(10)).toEqual({ readCount: 1, unreadCount: 2 });
    });

    it('커서가 낮아진 맵을 받으면 그대로 내려간다 (high-water 없음)', () => {
        const { result, rerender } = renderHook(({ byUser }) => useJoinPositions('c1', ['u1'], ['u1'], byUser, true), {
            initialProps: { byUser: cursors({ u1: 9 }) },
        });
        expect(result.current.getReadCount(9).readCount).toBe(1);

        rerender({ byUser: cursors({ u1: 2 }) });

        expect(result.current.getReadCount(9).readCount).toBe(0);
    });

    // With no cursors at all (joins haven't arrived yet), the read marker can't be rendered.
    it('isReady는 active 멤버와 커서가 모두 있을 때만 참이다', () => {
        const { result: empty } = renderHook(() => useJoinPositions('c1', ['u1'], ['u1'], cursors({}), true));
        expect(empty.current.isReady).toBe(false);

        const { result: ready } = renderHook(() => useJoinPositions('c1', ['u1'], ['u1'], cursors({ u1: 3 }), true));
        expect(ready.current.isReady).toBe(true);
    });
});
