import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel, DomainLastChat } from '@chatic/data';

import { useLastChats } from './useLastChats';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
    },
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
    observeLastList.mockImplementation((_ids: string[], cb: (rows: DomainLastChat[]) => void) => {
        emitRows = rows => act(() => cb(rows));
        return () => undefined;
    });
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        chat: { observeLastList, refreshList },
    });
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

    // 최근 메시지 적재는 이 화면 밖에서 따로 관리된다(네이티브 백그라운드 적재). 이 훅이
    // fetch를 들고 있으면 목록 렌더가 곧 네트워크가 되는 구조로 되돌아간다 — 그 회귀를 잡는다.
    it('순수 관측이다 — head가 앞서 있어도 네트워크(refreshList)를 만들지 않는다', () => {
        renderHook(() => useLastChats([channel('ch-a', 7)]));

        emitRows([row('ch-a', 1, 1)]);

        expect(refreshList).not.toHaveBeenCalled();
    });

    it('빈 채널 목록이면 관측 없이 빈 맵을 준다', () => {
        const { result } = renderHook(() => useLastChats([]));

        expect(observeLastList).not.toHaveBeenCalled();
        expect(result.current.size).toBe(0);
    });
});

describe('useLastChats — 재입장 이력 숨기기 (ADR-0067)', () => {
    const join = (channelId: string, joinedNo: number) => [channelId, { channelId, joinedNo } as never] as const;

    it('joinedNo 이하의 프리뷰는 맵에서 빠진다', () => {
        const { result } = renderHook(() =>
            useLastChats([channel('ch-a'), channel('ch-b')], new Map([join('ch-a', 5), join('ch-b', 5)]))
        );

        emitRows([row('ch-a', 3, 3), row('ch-b', 9, 9)]);

        // ch-a의 마지막 캐시 행은 퇴장 전 것이다 — 프리뷰 없는 채널이 된다.
        expect(result.current.get('ch-a')).toBeUndefined();
        expect(result.current.get('ch-b')).toEqual(expect.objectContaining({ chatNo: 9 }));
    });

    it('join 맵을 주지 않으면 아무것도 숨기지 않는다', () => {
        const { result } = renderHook(() => useLastChats([channel('ch-a')]));

        emitRows([row('ch-a', 3, 3)]);

        expect(result.current.get('ch-a')).toEqual(expect.objectContaining({ chatNo: 3 }));
    });

    it('새 join 맵 아이덴티티가 구독을 다시 열지 않는다', () => {
        // A read cursor moving rebuilds this map on the caller's side every time; re-subscribing
        // there would tear down the whole list's observation on each keystroke of activity.
        const { rerender } = renderHook(({ joins }) => useLastChats([channel('ch-a')], joins), {
            initialProps: { joins: new Map([join('ch-a', 1)]) },
        });

        rerender({ joins: new Map([join('ch-a', 1)]) });

        expect(observeLastList).toHaveBeenCalledTimes(1);
    });
});
