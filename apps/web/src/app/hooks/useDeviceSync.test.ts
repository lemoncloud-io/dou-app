import { renderHook } from '@testing-library/react';
import { useMatch } from 'react-router-dom';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';

import { useDeviceSync } from './useDeviceSync';

jest.mock('react-router-dom', () => ({
    useMatch: jest.fn(),
}));

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useSocketState: jest.fn(),
}));

const useMatchMock = useMatch as jest.Mock;
const useRuntimeRepositoriesMock = useRuntimeRepositories as jest.Mock;
const useSocketStateMock = useSocketState as jest.Mock;

const notifyViewing = jest.fn();

// Drive the hook by the channel currently matched by the route.
const setChannel = (channelId: string | null) =>
    useMatchMock.mockReturnValue(channelId ? { params: { channelId } } : null);

beforeEach(() => {
    jest.clearAllMocks();
    useRuntimeRepositoriesMock.mockReturnValue({ device: { notifyViewing } });
    useSocketStateMock.mockReturnValue({ isVerified: true });
    setChannel(null);
});

describe('useDeviceSync — 라우트 기반 viewing 통지', () => {
    it('비채널 라우트에서 시작하면 통지하지 않는다 (clear할 이전 값 없음)', () => {
        renderHook(() => useDeviceSync());

        expect(notifyViewing).not.toHaveBeenCalled();
    });

    it('채널 룸 진입 시 channel 짝으로, 목록 복귀 시 빈 짝으로 통지한다', () => {
        const { rerender } = renderHook(() => useDeviceSync());

        // home → channel A
        setChannel('A');
        rerender();
        expect(notifyViewing).toHaveBeenNthCalledWith(1, 'channel', 'A');

        // channel A → home (clear)
        setChannel(null);
        rerender();
        expect(notifyViewing).toHaveBeenNthCalledWith(2, '', '');
        expect(notifyViewing).toHaveBeenCalledTimes(2);
    });

    it('채널 A→B 전환은 중간 clear 없이 B만 통지한다', () => {
        setChannel('A');
        const { rerender } = renderHook(() => useDeviceSync());
        expect(notifyViewing).toHaveBeenNthCalledWith(1, 'channel', 'A');

        setChannel('B');
        rerender();
        expect(notifyViewing).toHaveBeenNthCalledWith(2, 'channel', 'B');
        expect(notifyViewing).toHaveBeenCalledTimes(2);
    });

    it('같은 채널로 재렌더되면 중복 통지하지 않는다', () => {
        setChannel('A');
        const { rerender } = renderHook(() => useDeviceSync());
        rerender();
        rerender();

        expect(notifyViewing).toHaveBeenCalledTimes(1);
    });

    it('미인증 상태에서는 통지를 보류하고, 재인증되면 현재 채널을 통지한다', () => {
        useSocketStateMock.mockReturnValue({ isVerified: false });
        setChannel('A');
        const { rerender } = renderHook(() => useDeviceSync());
        expect(notifyViewing).not.toHaveBeenCalled();

        // re-auth while still in channel A → re-assert viewing
        useSocketStateMock.mockReturnValue({ isVerified: true });
        rerender();
        expect(notifyViewing).toHaveBeenCalledWith('channel', 'A');
    });
});
