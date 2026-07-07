import { renderHook } from '@testing-library/react';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    webClient: { onEvent: jest.fn() },
}));

import { webClient } from '@chatic/bridges';

import { useAppForeground } from './useAppForeground';

const mockOnEvent = webClient.onEvent as jest.Mock;

// Simulate the two foreground sources: the native bridge message and visibilitychange.
const emitNative = (isForeground: boolean) => {
    const call = mockOnEvent.mock.calls.find(([type]) => type === 'OnBackgroundStatusChanged');
    call?.[1]({ data: { isForeground } });
};

const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('useAppForeground — 포그라운드 복귀 신호', () => {
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

    it('네이티브 OnBackgroundStatusChanged(isForeground=true)에서 핸들러를 호출한다', () => {
        const handler = jest.fn();
        renderHook(() => useAppForeground(handler));

        emitNative(true);

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('백그라운드 전환(isForeground=false)에는 반응하지 않는다', () => {
        const handler = jest.fn();
        renderHook(() => useAppForeground(handler));

        emitNative(false);

        expect(handler).not.toHaveBeenCalled();
    });

    it('visibilitychange → visible에서 핸들러를 호출한다', () => {
        const handler = jest.fn();
        renderHook(() => useAppForeground(handler));

        setVisibility('visible');

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('visibilitychange → hidden에는 반응하지 않는다', () => {
        const handler = jest.fn();
        renderHook(() => useAppForeground(handler));

        setVisibility('hidden');

        expect(handler).not.toHaveBeenCalled();
    });

    it('네이티브·웹 신호가 dedup 윈도 안에 겹치면 한 번만 호출한다', () => {
        const handler = jest.fn();
        renderHook(() => useAppForeground(handler));

        emitNative(true);
        now += 200; // both signals of one physical resume land within the window
        setVisibility('visible');

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('dedup 윈도가 지나면 다음 복귀에서 다시 호출한다', () => {
        const handler = jest.fn();
        renderHook(() => useAppForeground(handler));

        emitNative(true);
        now += 5_000; // a later, separate resume
        emitNative(true);

        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('언마운트 후에는 visibilitychange에 반응하지 않는다', () => {
        const handler = jest.fn();
        const { unmount } = renderHook(() => useAppForeground(handler));

        unmount();
        setVisibility('visible');

        expect(handler).not.toHaveBeenCalled();
    });
});
