import { act, renderHook } from '@testing-library/react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainChannel, DomainLastChat } from '@chatic/data';

import { useChatSyncRegistration } from './useChatSyncRegistration';

jest.mock('@chatic/app-runtime', () => ({
    getSyncManager: jest.fn(),
    useRuntimeRepositories: jest.fn(),
    useRuntimeSocketState: jest.fn(),
}));

const registerChat = jest.fn();
const updateLocalSnapshot = jest.fn();
const observeLastList = jest.fn();
const refreshList = jest.fn();

const channel = (id: string, chatNo = 0): DomainChannel => ({ id, chatNo }) as unknown as DomainChannel;
const row = (channelId: string, lastNo: number): DomainLastChat => ({ channelId, lastNo, chat: null });

/** 마지막 구독의 콜백 — emit()으로 결합 관측 결과 도착을 재현한다. */
let emitRows: (rows: DomainLastChat[]) => void = () => undefined;

beforeEach(() => {
    jest.clearAllMocks();
    observeLastList.mockImplementation((_ids: string[], cb: (rows: DomainLastChat[]) => void) => {
        emitRows = rows => act(() => cb(rows));
        return () => undefined;
    });
    refreshList.mockResolvedValue({ fetchedCount: 0 });
    registerChat.mockReturnValue(jest.fn());
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ chat: { observeLastList, refreshList } });
    (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (getSyncManager as jest.Mock).mockReturnValue({ registerChat, updateLocalSnapshot });
});

describe('useChatSyncRegistration — 활성 사이트 채널들의 chat sync', () => {
    it('채널마다 chat 타깃을 등록한다', () => {
        renderHook(() => useChatSyncRegistration([channel('c1'), channel('c2')]));

        expect(registerChat).toHaveBeenCalledWith('c1');
        expect(registerChat).toHaveBeenCalledWith('c2');
    });

    it('언마운트하면 등록을 모두 해제한다', () => {
        const dispose = jest.fn();
        registerChat.mockReturnValue(dispose);

        const { unmount } = renderHook(() => useChatSyncRegistration([channel('c1'), channel('c2')]));
        unmount();

        expect(dispose).toHaveBeenCalledTimes(2);
    });

    it('순서만 바뀐 같은 집합은 재등록하지 않는다', () => {
        const { rerender } = renderHook(({ channels }) => useChatSyncRegistration(channels), {
            initialProps: { channels: [channel('c1'), channel('c2')] },
        });
        rerender({ channels: [channel('c2'), channel('c1')] });

        expect(registerChat).toHaveBeenCalledTimes(2);
        expect(observeLastList).toHaveBeenCalledTimes(1);
    });

    it('소켓이 인증되기 전에는 등록하지 않는다', () => {
        (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });

        renderHook(() => useChatSyncRegistration([channel('c1')]));

        expect(registerChat).not.toHaveBeenCalled();
    });

    it('캐시의 lastNo로 plan 기준선을 맞춘다 (메시지 윈도우는 건드리지 않는다)', () => {
        renderHook(() => useChatSyncRegistration([channel('c1')]));

        emitRows([row('c1', 12)]);

        expect(updateLocalSnapshot).toHaveBeenCalledWith({ type: 'chat', id: 'c1' }, { id: 'c1', lastNo: 12 });
    });

    it('head가 캐시보다 앞선 채널만 최신 페이지를 당긴다', () => {
        renderHook(() => useChatSyncRegistration([channel('c1', 7), channel('c2', 3)]));

        emitRows([row('c1', 4), row('c2', 3)]);

        expect(refreshList).toHaveBeenCalledTimes(1);
        expect(refreshList).toHaveBeenCalledWith({ channelId: 'c1', limit: 30 });
    });

    it('같은 head로는 두 번 당기지 않는다', () => {
        renderHook(() => useChatSyncRegistration([channel('c1', 7)]));

        emitRows([row('c1', 4)]);
        // 응답이 프리뷰 불가 행뿐이라 lastNo가 그대로여도 재발사하지 않는다.
        emitRows([row('c1', 4)]);

        expect(refreshList).toHaveBeenCalledTimes(1);
    });

    it('첫 관측 결과가 오기 전에는 발사하지 않는다 — 비교 기준이 없으면 warm 캐시도 오판한다', () => {
        renderHook(() => useChatSyncRegistration([channel('c1', 7)]));

        expect(refreshList).not.toHaveBeenCalled();
    });
});
