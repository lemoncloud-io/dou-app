import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/runtime-react';

import { useJoinPositions } from './useJoinPositions';

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        connection: {
            useCloudVerified: jest.fn(),
        },
        sync: {
            registerSyncTarget: jest.fn(),
        },
        session: {
            useUidInCloud: jest.fn(),
        },
    })
);

const registerSyncTarget = runtime.sync.registerSyncTarget as jest.Mock;

const cursors = (entries: Record<string, number>) => new Map(Object.entries(entries));

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
    (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me');
    registerSyncTarget.mockReturnValue(() => undefined);
});

describe('useJoinPositions — 읽음 커서/안읽음 계산', () => {
    it('전체 멤버(memberIds)에 대해 join sync를 등록한다 — join 캐시는 관측하지 않는다', () => {
        renderHook(() => useJoinPositions('cloud-a', 'c1', ['u1', 'u2'], ['u1', 'u2', 'u3'], cursors({}), true));

        expect(registerSyncTarget).toHaveBeenCalledTimes(3);
        expect(registerSyncTarget).toHaveBeenCalledWith({ type: 'join', id: 'c1@u1' }, { cid: 'cloud-a' });
        expect(registerSyncTarget).toHaveBeenCalledWith({ type: 'join', id: 'c1@u2' }, { cid: 'cloud-a' });
        expect(registerSyncTarget).toHaveBeenCalledWith({ type: 'join', id: 'c1@u3' }, { cid: 'cloud-a' });
    });

    it('멤버가 아니면(isMember=false) 로스터 폴링을 등록하지 않는다', () => {
        renderHook(() => useJoinPositions('cloud-a', 'c1', ['u1', 'u2'], ['u1', 'u2', 'me'], cursors({}), false));

        expect(registerSyncTarget).not.toHaveBeenCalled();
    });

    it('멤버 판정이 false→true로 바뀌면 그때 등록한다', () => {
        const { rerender } = renderHook(
            ({ isMember }) => useJoinPositions('cloud-a', 'c1', ['u1'], ['u1', 'me'], cursors({}), isMember),
            { initialProps: { isMember: false } }
        );
        expect(registerSyncTarget).not.toHaveBeenCalled();

        rerender({ isMember: true });

        expect(registerSyncTarget).toHaveBeenCalledTimes(2);
        expect(registerSyncTarget).toHaveBeenCalledWith({ type: 'join', id: 'c1@u1' }, { cid: 'cloud-a' });
        expect(registerSyncTarget).toHaveBeenCalledWith({ type: 'join', id: 'c1@me' }, { cid: 'cloud-a' });
    });

    it('세션 미검증(isVerified=false)이면 join sync를 등록하지 않는다', () => {
        (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(false);

        renderHook(() => useJoinPositions('cloud-a', 'c1', ['u1', 'u2'], ['u1', 'u2'], cursors({}), true));

        expect(registerSyncTarget).not.toHaveBeenCalled();
    });

    it('로스터가 그대로면 재등록하지 않는다 (커서만 바뀌는 흔한 경우)', () => {
        const { rerender } = renderHook(
            ({ byUser }) => useJoinPositions('cloud-a', 'c1', ['u1'], ['u1'], byUser, true),
            {
                initialProps: { byUser: cursors({ u1: 1 }) },
            }
        );
        expect(registerSyncTarget).toHaveBeenCalledTimes(1);

        rerender({ byUser: cursors({ u1: 7 }) });

        expect(registerSyncTarget).toHaveBeenCalledTimes(1);
    });

    it('커서는 넘겨받은 max(readNo, chatNo) 맵을 그대로 쓴다', () => {
        const { result } = renderHook(() =>
            useJoinPositions('cloud-a', 'c1', ['u1', 'u2'], ['u1', 'u2'], cursors({ u1: 5, u2: 4 }), true)
        );

        expect(result.current.getReadCount(5)).toEqual({ readCount: 1, unreadCount: 1 });
        expect(result.current.getReadCount(4)).toEqual({ readCount: 2, unreadCount: 0 });
    });

    it('분모는 active 멤버 수와 일치한다', () => {
        const { result } = renderHook(() =>
            useJoinPositions('cloud-a', 'c1', ['u1', 'u2', 'u3'], ['u1', 'u2', 'u3'], cursors({ u1: 10 }), true)
        );

        expect(result.current.getReadCount(10)).toEqual({ readCount: 1, unreadCount: 2 });
    });

    it('커서가 낮아진 맵을 받으면 그대로 내려간다 (high-water 없음)', () => {
        const { result, rerender } = renderHook(
            ({ byUser }) => useJoinPositions('cloud-a', 'c1', ['u1'], ['u1'], byUser, true),
            {
                initialProps: { byUser: cursors({ u1: 9 }) },
            }
        );
        expect(result.current.getReadCount(9).readCount).toBe(1);

        rerender({ byUser: cursors({ u1: 2 }) });

        expect(result.current.getReadCount(9).readCount).toBe(0);
    });

    it('isReady는 active 멤버와 커서가 모두 있을 때만 참이다', () => {
        const { result: empty } = renderHook(() =>
            useJoinPositions('cloud-a', 'c1', ['u1'], ['u1'], cursors({}), true)
        );
        expect(empty.current.isReady).toBe(false);

        const { result: ready } = renderHook(() =>
            useJoinPositions('cloud-a', 'c1', ['u1'], ['u1'], cursors({ u1: 3 }), true)
        );
        expect(ready.current.isReady).toBe(true);
    });

    it("registers under the channel's cloud and waits for that cloud's slot", () => {
        renderHook(() => useJoinPositions('cloud-b', 'c1', ['u1'], ['u1'], cursors({}), true));

        expect(runtime.connection.useCloudVerified).toHaveBeenCalledWith('cloud-b');
        expect(runtime.session.useUidInCloud).toHaveBeenCalledWith('cloud-b');
        expect(registerSyncTarget).toHaveBeenCalledWith({ type: 'join', id: 'c1@u1' }, { cid: 'cloud-b' });
    });

    it('re-registers when my uid in the cloud changes', () => {
        const { rerender } = renderHook(() => useJoinPositions('cloud-a', 'c1', ['u1'], ['u1'], cursors({}), true));
        expect(registerSyncTarget).toHaveBeenCalledTimes(1);

        (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me-again');
        rerender();

        expect(registerSyncTarget).toHaveBeenCalledTimes(2);
    });

    it('lists the active members whose cursor has reached a message, for the receipt faces', () => {
        const { result } = renderHook(() =>
            useJoinPositions(
                'cloud-a',
                'c1',
                ['me', 'u1', 'u2'],
                ['me', 'u1', 'u2', 'gone'],
                cursors({ me: 9, u1: 5, u2: 3, gone: 9 }),
                true
            )
        );

        expect(result.current.getReaders(5)).toEqual(['me', 'u1']);
        expect(result.current.getReaders(10)).toEqual([]);
    });
});
