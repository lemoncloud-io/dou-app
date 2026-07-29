import { act, renderHook } from '@testing-library/react';

const observeItemMock = jest.fn();
const unsubscribeMock = jest.fn();
// Stable across renders, like the real useRuntimeRepositories() (a cached singleton) — a fresh
// object per call would make the effect's `[channel, channelId]` deps "change" every render.
const repositories = { channel: { observeItem: observeItemMock } };

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => repositories,
}));

import { useAcceptedChannelSync } from './useAcceptedChannelSync';

describe('useAcceptedChannelSync', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        observeItemMock.mockReturnValue(unsubscribeMock);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('channelId가 없으면 즉시 unknown이다(관찰을 시작하지 않는다)', () => {
        const { result } = renderHook(() => useAcceptedChannelSync(undefined));
        expect(result.current.status).toBe('unknown');
        expect(observeItemMock).not.toHaveBeenCalled();
    });

    it('channelId가 있으면 waiting으로 시작해 observeItem을 구독한다', () => {
        const { result } = renderHook(() => useAcceptedChannelSync('channel-1'));
        expect(result.current.status).toBe('waiting');
        expect(observeItemMock).toHaveBeenCalledWith('channel-1', expect.any(Function));
    });

    it('로컬에 채널이 동기화되면 ready로 전환한다', () => {
        const { result } = renderHook(() => useAcceptedChannelSync('channel-1'));
        const callback = observeItemMock.mock.calls[0][1];

        act(() => callback({ id: 'channel-1' }));

        expect(result.current.status).toBe('ready');
    });

    it('타임아웃 전에 동기화되지 않으면 timeout으로 전환한다', () => {
        const { result } = renderHook(() => useAcceptedChannelSync('channel-1'));

        act(() => jest.advanceTimersByTime(8_000));

        expect(result.current.status).toBe('timeout');
    });

    it('타임아웃 이후 콜백이 와도 상태를 되돌리지 않는다', () => {
        const { result } = renderHook(() => useAcceptedChannelSync('channel-1'));
        const callback = observeItemMock.mock.calls[0][1];

        act(() => jest.advanceTimersByTime(8_000));
        act(() => callback({ id: 'channel-1' }));

        expect(result.current.status).toBe('timeout');
    });

    it('언마운트 시 구독을 해제한다', () => {
        const { unmount } = renderHook(() => useAcceptedChannelSync('channel-1'));
        unmount();
        expect(unsubscribeMock).toHaveBeenCalled();
    });
});
