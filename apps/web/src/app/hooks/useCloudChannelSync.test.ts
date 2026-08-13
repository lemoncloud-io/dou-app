import { renderHook } from '@testing-library/react';

import { getSyncManager, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

import { useCloudChannelSync } from './useCloudChannelSync';

jest.mock('@chatic/app-runtime', () => ({
    getSyncManager: jest.fn(),
    useRuntimeSocketState: jest.fn(),
}));

const channel = (id: string): DomainChannel => ({ id }) as unknown as DomainChannel;

const registerChannelMock = jest.fn();
const disposers: jest.Mock[] = [];

beforeEach(() => {
    jest.clearAllMocks();
    disposers.length = 0;
    registerChannelMock.mockImplementation(() => {
        const dispose = jest.fn();
        disposers.push(dispose);
        return dispose;
    });
    (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (getSyncManager as jest.Mock).mockReturnValue({ registerChannel: registerChannelMock });
});

describe('useCloudChannelSync', () => {
    // The head half of unread lives on the channel record, so every cloud channel needs a target —
    // not just the ones the active place renders.
    it('클라우드의 모든 채널에 sync 타깃을 등록한다', () => {
        renderHook(() => useCloudChannelSync([channel('ch-1'), channel('ch-2'), channel('ch-3')]));

        expect(registerChannelMock.mock.calls.map(call => call[0])).toEqual(['ch-1', 'ch-2', 'ch-3']);
    });

    // Registrations must die with the screen that wants them; an always-mounted consumer would
    // otherwise keep polling every channel on every route.
    it('언마운트하면 등록을 전부 해제한다', () => {
        const { unmount } = renderHook(() => useCloudChannelSync([channel('ch-1'), channel('ch-2')]));

        unmount();

        expect(disposers).toHaveLength(2);
        disposers.forEach(dispose => expect(dispose).toHaveBeenCalled());
    });

    it('소켓이 검증되기 전에는 등록하지 않는다', () => {
        (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });

        renderHook(() => useCloudChannelSync([channel('ch-1')]));

        expect(registerChannelMock).not.toHaveBeenCalled();
    });

    // 같은 채널 집합이면 재등록하지 않는다 — 배열 identity가 매 렌더 새로 생기기 때문.
    it('채널 집합이 그대로면 리렌더에도 재등록하지 않는다', () => {
        const { rerender } = renderHook(({ ids }: { ids: string[] }) => useCloudChannelSync(ids.map(channel)), {
            initialProps: { ids: ['ch-1', 'ch-2'] },
        });
        expect(registerChannelMock).toHaveBeenCalledTimes(2);

        rerender({ ids: ['ch-1', 'ch-2'] });

        expect(registerChannelMock).toHaveBeenCalledTimes(2);
    });
});
