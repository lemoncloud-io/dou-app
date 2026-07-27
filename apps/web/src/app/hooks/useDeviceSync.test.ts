import { act, renderHook } from '@testing-library/react';
import { useMatch } from 'react-router-dom';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';

import { useAppVisibility } from '../bridge';
import { useDeviceSync } from './useDeviceSync';

jest.mock('react-router-dom', () => ({
    useMatch: jest.fn(),
}));

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useRuntimeSocketState: jest.fn(),
}));

// The bridge hook is unit-tested on its own; here we only need to drive its handler.
jest.mock('../bridge', () => ({
    useAppVisibility: jest.fn(),
}));

const useMatchMock = useMatch as jest.Mock;
const useRuntimeRepositoriesMock = useRuntimeRepositories as jest.Mock;
const useRuntimeSocketStateMock = useRuntimeSocketState as jest.Mock;
const useAppVisibilityMock = useAppVisibility as jest.Mock;

const syncDevice = jest.fn();
const syncStatus = jest.fn();

// Drive the hook by the channel currently matched by the route.
const setChannel = (channelId: string | null) =>
    useMatchMock.mockReturnValue(channelId ? { params: { channelId } } : null);

// Fire the visibility handler captured from the latest render, as the bridge would.
const emitVisibility = (isForeground: boolean) => {
    const calls = useAppVisibilityMock.mock.calls;
    act(() => calls[calls.length - 1][0](isForeground));
};

beforeEach(() => {
    jest.clearAllMocks();
    useRuntimeRepositoriesMock.mockReturnValue({ device: { syncDevice, syncStatus } });
    useRuntimeSocketStateMock.mockReturnValue({ isVerified: true });
    setChannel(null);
});

describe('useDeviceSync — 라우트 기반 viewing 통지', () => {
    it('비채널 라우트에서 시작하면 통지하지 않는다 (clear할 이전 값 없음)', () => {
        renderHook(() => useDeviceSync());

        expect(syncDevice).not.toHaveBeenCalled();
    });

    it('채널 룸 진입 시 channel 짝으로, 목록 복귀 시 빈 짝으로 통지한다', () => {
        const { rerender } = renderHook(() => useDeviceSync());

        // home → channel A
        setChannel('A');
        rerender();
        expect(syncDevice).toHaveBeenNthCalledWith(1, 'channel', 'A');

        // channel A → home (clear)
        setChannel(null);
        rerender();
        expect(syncDevice).toHaveBeenNthCalledWith(2, '', '');
        expect(syncDevice).toHaveBeenCalledTimes(2);
    });

    it('채널 A→B 전환은 중간 clear 없이 B만 통지한다', () => {
        setChannel('A');
        const { rerender } = renderHook(() => useDeviceSync());
        expect(syncDevice).toHaveBeenNthCalledWith(1, 'channel', 'A');

        setChannel('B');
        rerender();
        expect(syncDevice).toHaveBeenNthCalledWith(2, 'channel', 'B');
        expect(syncDevice).toHaveBeenCalledTimes(2);
    });

    it('같은 채널로 재렌더되면 중복 통지하지 않는다', () => {
        setChannel('A');
        const { rerender } = renderHook(() => useDeviceSync());
        rerender();
        rerender();

        expect(syncDevice).toHaveBeenCalledTimes(1);
    });

    it('미인증 상태에서는 통지를 보류하고, 재인증되면 현재 채널을 통지한다', () => {
        useRuntimeSocketStateMock.mockReturnValue({ isVerified: false });
        setChannel('A');
        const { rerender } = renderHook(() => useDeviceSync());
        expect(syncDevice).not.toHaveBeenCalled();

        // re-auth while still in channel A → re-assert viewing
        useRuntimeSocketStateMock.mockReturnValue({ isVerified: true });
        rerender();
        expect(syncDevice).toHaveBeenCalledWith('channel', 'A');
    });
});

describe('useDeviceSync — 가시성 기반 status 통지', () => {
    it('verified로 시작하면 초기 status로 green을 1회 전송한다 (앱 시작 catch-up)', () => {
        renderHook(() => useDeviceSync());

        expect(syncStatus).toHaveBeenCalledTimes(1);
        expect(syncStatus).toHaveBeenCalledWith('green');
    });

    it('백그라운드 전환 시 yellow, 포그라운드 복귀 시 green을 전송한다', () => {
        renderHook(() => useDeviceSync());
        syncStatus.mockClear(); // drop the initial catch-up green

        emitVisibility(false);
        expect(syncStatus).toHaveBeenNthCalledWith(1, 'yellow');

        emitVisibility(true);
        expect(syncStatus).toHaveBeenNthCalledWith(2, 'green');
    });

    it('같은 상태의 중복 신호는 재전송하지 않는다', () => {
        renderHook(() => useDeviceSync());
        syncStatus.mockClear();

        emitVisibility(false);
        emitVisibility(false);

        expect(syncStatus).toHaveBeenCalledTimes(1);
    });

    it('재인증(rising edge) 시 현재 status를 재단언한다', () => {
        const { rerender } = renderHook(() => useDeviceSync());
        emitVisibility(false);
        syncStatus.mockClear();

        // Socket drops: the reconnect never replays status, so the hook must.
        useRuntimeSocketStateMock.mockReturnValue({ isVerified: false });
        rerender();
        expect(syncStatus).not.toHaveBeenCalled();

        useRuntimeSocketStateMock.mockReturnValue({ isVerified: true });
        rerender();
        expect(syncStatus).toHaveBeenCalledTimes(1);
        expect(syncStatus).toHaveBeenCalledWith('yellow');
    });

    it('미인증 중 전환은 전송하지 않고, 재인증 시 현재 status를 단언한다', () => {
        useRuntimeSocketStateMock.mockReturnValue({ isVerified: false });
        const { rerender } = renderHook(() => useDeviceSync());
        expect(syncStatus).not.toHaveBeenCalled();

        // Disconnected: a visibility change records intent only — nothing is sent over a dead socket.
        emitVisibility(false);
        expect(syncStatus).not.toHaveBeenCalled();

        // Re-connect → the catch-up asserts the current (yellow) status exactly once.
        useRuntimeSocketStateMock.mockReturnValue({ isVerified: true });
        rerender();
        expect(syncStatus).toHaveBeenCalledTimes(1);
        expect(syncStatus).toHaveBeenCalledWith('yellow');
    });
});

describe('useDeviceSync — 가시성 기반 viewing 통지', () => {
    it('채널 룸에서 백그라운드로 가면 viewing 짝을 비운다', () => {
        setChannel('A');
        renderHook(() => useDeviceSync());
        expect(syncDevice).toHaveBeenNthCalledWith(1, 'channel', 'A');

        emitVisibility(false);
        expect(syncDevice).toHaveBeenNthCalledWith(2, '', '');
        expect(syncDevice).toHaveBeenCalledTimes(2);
    });

    it('포그라운드 복귀 시 현재 채널 viewing을 복원한다', () => {
        setChannel('A');
        renderHook(() => useDeviceSync());
        emitVisibility(false); // clears to ('', '')
        syncDevice.mockClear();

        emitVisibility(true);
        expect(syncDevice).toHaveBeenNthCalledWith(1, 'channel', 'A');
        expect(syncDevice).toHaveBeenCalledTimes(1);
    });

    it('비채널 라우트에서의 백그라운드/포그라운드는 viewing을 재통지하지 않는다', () => {
        renderHook(() => useDeviceSync());
        expect(syncDevice).not.toHaveBeenCalled();

        emitVisibility(false);
        emitVisibility(true);
        expect(syncDevice).not.toHaveBeenCalled();
    });

    it('백그라운드에서 이미 비운 viewing은 중복 신호로 재통지하지 않는다', () => {
        setChannel('A');
        renderHook(() => useDeviceSync());
        emitVisibility(false); // ('', '')
        syncDevice.mockClear();

        emitVisibility(false); // same direction — no re-clear
        expect(syncDevice).not.toHaveBeenCalled();
    });
});
