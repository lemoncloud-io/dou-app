import { act, renderHook } from '@testing-library/react';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainChannel, DomainLastChat } from '@chatic/data';

import { useLastChats } from './useLastChats';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useRuntimeSocketState: jest.fn(),
}));

const observeLastList = jest.fn();
const refreshList = jest.fn();

const channel = (id: string, chatNo = 0): DomainChannel => ({ id, chatNo }) as unknown as DomainChannel;
const row = (channelId: string, lastNo: number, chatNo?: number): DomainLastChat => ({
    channelId,
    lastNo,
    chat: chatNo === undefined ? null : ({ id: `m-${chatNo}`, channelId, chatNo } as never),
});

/** 마지막 구독의 콜백 — emit()으로 관측 결과 도착을 재현한다. */
let emitRows: (rows: DomainLastChat[]) => void = () => undefined;

beforeEach(() => {
    jest.clearAllMocks();
    refreshList.mockResolvedValue(undefined);
    observeLastList.mockImplementation((_ids: string[], cb: (rows: DomainLastChat[]) => void) => {
        emitRows = rows => act(() => cb(rows));
        return () => undefined;
    });
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        chat: { observeLastList, refreshList },
    });
    (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
});

describe('useLastChats — 홈 목록의 결합 프리뷰 관측 (ADR-0057)', () => {
    it('채널 집합을 정렬해 한 번 관측하고, 결과를 channelId → chat 맵으로 준다', () => {
        const { result } = renderHook(() => useLastChats([channel('ch-b'), channel('ch-a')]));

        expect(observeLastList).toHaveBeenCalledTimes(1);
        expect(observeLastList.mock.calls[0][0]).toEqual(['ch-a', 'ch-b']);

        emitRows([row('ch-a', 3, 3), row('ch-b', 0)]);

        expect(result.current.get('ch-a')).toEqual(expect.objectContaining({ chatNo: 3 }));
        // 프리뷰할 행이 없는 채널은 맵에서 빠진다 — 소비자는 undefined로 "프리뷰 없음"을 읽는다.
        expect(result.current.get('ch-b')).toBeUndefined();
    });

    it('순서만 바뀐 같은 집합은 재구독하지 않는다', () => {
        const { rerender } = renderHook(({ channels }) => useLastChats(channels), {
            initialProps: { channels: [channel('ch-a'), channel('ch-b')] },
        });
        rerender({ channels: [channel('ch-b'), channel('ch-a')] });

        expect(observeLastList).toHaveBeenCalledTimes(1);
    });

    it('첫 관측 결과가 오기 전에는 head가 앞서 있어도 refresh를 쏘지 않는다', () => {
        // 구 useLastChat의 초기화 레이스: 비교 기준(cachedMax)이 느린 읽기로 채워지기 전에
        // 채널 head가 먼저 도착하면 warm 캐시에도 fetch가 나갔다. 새 훅은 기준이 없으면 잠근다.
        renderHook(() => useLastChats([channel('ch-a', 7)]));

        expect(refreshList).not.toHaveBeenCalled();
    });

    it('관측 결과 도착 후 head가 lastNo를 넘어선 채널만 refresh한다', () => {
        const { rerender } = renderHook(({ channels }) => useLastChats(channels), {
            initialProps: { channels: [channel('ch-a', 3), channel('ch-b', 5)] },
        });

        emitRows([row('ch-a', 3, 3), row('ch-b', 3, 3)]);

        // ch-a: head(3) == lastNo(3) → 조용. ch-b: head(5) > lastNo(3) → 그 채널만.
        expect(refreshList).toHaveBeenCalledTimes(1);
        expect(refreshList).toHaveBeenCalledWith({ channelId: 'ch-b', limit: 30 });

        // 같은 head로는 다시 쏘지 않는다 — 최신 행이 답글/리액션이라 lastNo가 안 오르는
        // 채널이 리렌더마다 fetch를 반복하면 그게 곧 폭주다.
        rerender({ channels: [channel('ch-a', 3), channel('ch-b', 5)] });
        expect(refreshList).toHaveBeenCalledTimes(1);
    });

    it('프리뷰 chatNo가 아니라 lastNo와 비교한다 — 최신 행이 리액션인 채널을 오판하지 않는다', () => {
        renderHook(() => useLastChats([channel('ch-a', 5)]));

        // 캐시 최신은 5(리액션)지만 프리뷰는 3에 머무는 상태: 부족분이 아니다.
        emitRows([row('ch-a', 5, 3)]);

        expect(refreshList).not.toHaveBeenCalled();
    });

    it('소켓 미인증 상태에서는 refresh를 유보한다', () => {
        (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });
        renderHook(() => useLastChats([channel('ch-a', 9)]));

        emitRows([row('ch-a', 1, 1)]);

        expect(refreshList).not.toHaveBeenCalled();
    });

    it('빈 채널 목록이면 관측 없이 빈 맵을 준다', () => {
        const { result } = renderHook(() => useLastChats([]));

        expect(observeLastList).not.toHaveBeenCalled();
        expect(result.current.size).toBe(0);
    });
});
