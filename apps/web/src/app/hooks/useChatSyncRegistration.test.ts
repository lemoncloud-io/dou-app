import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel, DomainLastChat } from '@chatic/data';

import { useChatSyncRegistration } from './useChatSyncRegistration';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        sync: {
            getSyncManager: jest.fn(),
        },
        session: {
            useSessionSelection: jest.fn(),
            getGlobalSessionContext: jest.fn(),
            useUidInCloud: jest.fn(),
        },
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        connection: {
            useRuntimeSocketState: jest.fn(),
            useCloudVerified: jest.fn(),
        },
    },
}));

const registerChat = jest.fn();
const updateLocalSnapshot = jest.fn();
const observeLastList = jest.fn();
const refreshList = jest.fn();

/** Moves the selection, as both the render and a read outside it see it. */
const select = (cid: string) => {
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: cid });
    (runtime.session.getGlobalSessionContext as jest.Mock).mockReturnValue({ cloud: { cloudId: cid } });
};

const channel = (id: string, chatNo = 0): DomainChannel => ({ id, chatNo }) as unknown as DomainChannel;
const row = (channelId: string, lastNo: number): DomainLastChat => ({ channelId, lastNo, chat: null });

/** The last subscription's callback — emit() replays a combined observation result arriving. */
let emitRows: (rows: DomainLastChat[]) => void = () => undefined;
/** The same callback without its own act(), for a test that lands it in one batch with a switch. */
let rawEmit: (rows: DomainLastChat[]) => void = () => undefined;

beforeEach(() => {
    jest.clearAllMocks();
    observeLastList.mockImplementation((_ids: string[], cb: (rows: DomainLastChat[]) => void) => {
        emitRows = rows => act(() => cb(rows));
        rawEmit = cb;
        return () => undefined;
    });
    refreshList.mockResolvedValue({ fetchedCount: 0 });
    registerChat.mockReturnValue(jest.fn());
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ chat: { observeLastList, refreshList } });
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
    select('cloud-a');
    (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me');
    (runtime.sync.getSyncManager as jest.Mock).mockReturnValue({ registerChat, updateLocalSnapshot });
});

describe('useChatSyncRegistration — 활성 사이트 채널들의 chat sync', () => {
    it('채널마다 chat 타깃을 등록한다', () => {
        renderHook(() => useChatSyncRegistration([channel('c1'), channel('c2')]));

        expect(registerChat).toHaveBeenCalledWith('c1', undefined, { cid: 'cloud-a' });
        expect(registerChat).toHaveBeenCalledWith('c2', undefined, { cid: 'cloud-a' });
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
        (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(false);

        renderHook(() => useChatSyncRegistration([channel('c1')]));

        expect(registerChat).not.toHaveBeenCalled();
    });

    it('캐시의 lastNo로 plan 기준선을 맞춘다 (메시지 윈도우는 건드리지 않는다)', () => {
        renderHook(() => useChatSyncRegistration([channel('c1')]));

        emitRows([row('c1', 12)]);

        expect(updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'c1' },
            { id: 'c1', lastNo: 12 },
            { cid: 'cloud-a' }
        );
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
        // The response is only non-previewable rows, so it doesn't refire even though lastNo is unchanged.
        emitRows([row('c1', 4)]);

        expect(refreshList).toHaveBeenCalledTimes(1);
    });

    it('첫 관측 결과가 오기 전에는 발사하지 않는다 — 비교 기준이 없으면 warm 캐시도 오판한다', () => {
        renderHook(() => useChatSyncRegistration([channel('c1', 7)]));

        expect(refreshList).not.toHaveBeenCalled();
    });

    it("waits for the selected cloud's own slot before registering", () => {
        renderHook(() => useChatSyncRegistration([channel('c1')]));

        expect(runtime.connection.useCloudVerified).toHaveBeenCalledWith('cloud-a');
    });

    it('re-registers when the uid in the cloud changes', () => {
        const { rerender } = renderHook(() => useChatSyncRegistration([channel('c1')]));

        (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('someone-else');
        rerender();

        expect(registerChat).toHaveBeenCalledTimes(2);
    });

    it('re-registers and re-observes under the next cloud after a switch', () => {
        const { rerender } = renderHook(() => useChatSyncRegistration([channel('c1')]));

        select('cloud-b');
        rerender();

        expect(registerChat).toHaveBeenLastCalledWith('c1', undefined, { cid: 'cloud-b' });
        expect(observeLastList).toHaveBeenCalledTimes(2);
    });

    it('does not push a baseline to a cloud the selection moved to after the observation', () => {
        const { rerender } = renderHook(() => useChatSyncRegistration([channel('c1')]));

        // The reading lands in the same batch as the switch, so the effect that pushes it runs in a
        // render whose selection is already the next cloud.
        select('cloud-b');
        act(() => {
            rawEmit([row('c1', 12)]);
            rerender();
        });

        expect(updateLocalSnapshot).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), {
            cid: 'cloud-b',
        });
        expect(updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'c1' },
            { id: 'c1', lastNo: 12 },
            { cid: 'cloud-a' }
        );
    });

    it("does not catch up the next cloud's channels from the cloud the list just left", () => {
        const { rerender } = renderHook(({ channels }) => useChatSyncRegistration(channels), {
            initialProps: { channels: [channel('a1', 5)] },
        });
        emitRows([row('a1', 5)]);

        select('cloud-b');
        rerender({ channels: [channel('b1', 3)] });

        expect(refreshList).not.toHaveBeenCalled();
        emitRows([row('b1', 1)]);
        expect(refreshList).toHaveBeenCalledWith({ channelId: 'b1', limit: 30 });
    });
});
