import { act, renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainChannel, DomainLastChat } from '@chatic/data';

import { useLastChats } from './useLastChats';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
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
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
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
