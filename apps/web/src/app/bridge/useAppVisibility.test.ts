import { renderHook } from '@testing-library/react';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    webClient: { onEvent: jest.fn() },
}));

import { webClient } from '@chatic/bridges';

import { useAppVisibility } from './useAppVisibility';

const mockOnEvent = webClient.onEvent as jest.Mock;

// Simulate the two visibility sources: the native bridge message and visibilitychange.
const emitNative = (isForeground: boolean) => {
    const call = mockOnEvent.mock.calls.find(([type]) => type === 'OnBackgroundStatusChanged');
    call?.[1]({ data: { isForeground } });
};

const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('useAppVisibility — 포그라운드/백그라운드 통합 신호', () => {
    let now = 0;
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnEvent.mockReturnValue(jest.fn());
        // Deterministic clock for the dedup window; each test advances `now` explicitly.
        now = 10_000;
        dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
        dateNowSpy.mockRestore();
    });

    it('네이티브 OnBackgroundStatusChanged를 방향 그대로 전달한다', () => {
        const handler = jest.fn();
        renderHook(() => useAppVisibility(handler));

        emitNative(true);
        now += 5_000;
        emitNative(false);

        expect(handler).toHaveBeenNthCalledWith(1, true);
        expect(handler).toHaveBeenNthCalledWith(2, false);
    });

    it('visibilitychange를 visible=true / hidden=false로 전달한다', () => {
        const handler = jest.fn();
        renderHook(() => useAppVisibility(handler));

        setVisibility('hidden');
        now += 5_000;
        setVisibility('visible');

        expect(handler).toHaveBeenNthCalledWith(1, false);
        expect(handler).toHaveBeenNthCalledWith(2, true);
    });

    it('같은 방향 신호가 dedup 윈도 안에 겹치면 한 번만 호출한다', () => {
        const handler = jest.fn();
        renderHook(() => useAppVisibility(handler));

        emitNative(true);
        now += 200; // both signals of one physical resume land within the window
        setVisibility('visible');

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('반대 방향 신호는 dedup 윈도 안이라도 서로 삼키지 않는다', () => {
        const handler = jest.fn();
        renderHook(() => useAppVisibility(handler));

        // Fast app switch: background then foreground within the window.
        emitNative(false);
        now += 200;
        emitNative(true);

        expect(handler).toHaveBeenNthCalledWith(1, false);
        expect(handler).toHaveBeenNthCalledWith(2, true);
    });

    it('dedup 윈도가 지나면 같은 방향도 다시 호출한다', () => {
        const handler = jest.fn();
        renderHook(() => useAppVisibility(handler));

        emitNative(true);
        now += 5_000; // a later, separate resume
        emitNative(true);

        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('언마운트 후에는 visibilitychange에 반응하지 않는다', () => {
        const handler = jest.fn();
        const { unmount } = renderHook(() => useAppVisibility(handler));

        unmount();
        setVisibility('visible');

        expect(handler).not.toHaveBeenCalled();
    });
});
