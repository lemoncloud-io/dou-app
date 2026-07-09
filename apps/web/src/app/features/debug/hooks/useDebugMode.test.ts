// Mock the bridge so the hook's native propagation is observable and jsdom
// never touches the real webClient.
jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
jest.mock('../../../bridge', () => ({ appBridge: { setDebugMode: jest.fn() } }));

import { act, renderHook } from '@testing-library/react';

import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { useDebugMode } from './useDebugMode';
import { DEBUG_STORAGE_KEY } from '../consts';

const isNativeMock = isNative as jest.Mock;
const setDebugModeMock = appBridge.setDebugMode as jest.Mock;

const tap = (registerTap: () => void, times: number) =>
    act(() => {
        for (let i = 0; i < times; i++) registerTap();
    });

describe('useDebugMode — 숨겨진 디버그 모드 게이트', () => {
    beforeEach(() => {
        sessionStorage.clear();
        jest.clearAllMocks();
        isNativeMock.mockReturnValue(false);
        delete (window as unknown as { CHATIC_APP_DEBUG_MODE?: boolean }).CHATIC_APP_DEBUG_MODE;
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('sessionStorage 값이 없으면 비활성 상태로 시작한다', () => {
        const { result } = renderHook(() => useDebugMode());
        expect(result.current.isEnabled).toBe(false);
    });

    it('sessionStorage에 플래그가 있으면 활성 상태로 시작한다', () => {
        sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
        const { result } = renderHook(() => useDebugMode());
        expect(result.current.isEnabled).toBe(true);
    });

    it('10회 탭하면 디버그 모드가 열리고 플래그가 저장된다', () => {
        const { result } = renderHook(() => useDebugMode());
        tap(result.current.registerTap, 10);
        expect(result.current.isEnabled).toBe(true);
        expect(sessionStorage.getItem(DEBUG_STORAGE_KEY)).toBe('true');
    });

    it('9회 탭으로는 열리지 않는다', () => {
        const { result } = renderHook(() => useDebugMode());
        tap(result.current.registerTap, 9);
        expect(result.current.isEnabled).toBe(false);
        expect(sessionStorage.getItem(DEBUG_STORAGE_KEY)).toBeNull();
    });

    it('3초가 지나면 탭 카운트가 초기화되어 누적되지 않는다', () => {
        const { result } = renderHook(() => useDebugMode());
        tap(result.current.registerTap, 5);
        act(() => {
            jest.advanceTimersByTime(3000);
        });
        tap(result.current.registerTap, 5);
        expect(result.current.isEnabled).toBe(false);
    });

    it('disable는 디버그 모드를 끄고 플래그를 제거한다', () => {
        sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
        const { result } = renderHook(() => useDebugMode());
        expect(result.current.isEnabled).toBe(true);

        act(() => result.current.disable());

        expect(result.current.isEnabled).toBe(false);
        expect(sessionStorage.getItem(DEBUG_STORAGE_KEY)).toBeNull();
    });

    it('한 인스턴스에서 언락하면 다른 인스턴스도 즉시 활성화된다', () => {
        // The always-mounted debug overlay must react to the MyPage 10-tap unlock.
        const unlocker = renderHook(() => useDebugMode());
        const observer = renderHook(() => useDebugMode());
        expect(observer.result.current.isEnabled).toBe(false);

        tap(unlocker.result.current.registerTap, 10);

        expect(observer.result.current.isEnabled).toBe(true);
    });

    it('한 인스턴스에서 disable하면 다른 인스턴스도 즉시 비활성화된다', () => {
        sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
        const a = renderHook(() => useDebugMode());
        const b = renderHook(() => useDebugMode());

        act(() => a.result.current.disable());

        expect(b.result.current.isEnabled).toBe(false);
    });

    it('네이티브 셸에서 언락하면 브릿지로 전파된다', () => {
        isNativeMock.mockReturnValue(true);
        const { result } = renderHook(() => useDebugMode());
        tap(result.current.registerTap, 10);
        expect(setDebugModeMock).toHaveBeenCalledWith(true);

        act(() => result.current.disable());
        expect(setDebugModeMock).toHaveBeenLastCalledWith(false);
    });

    it('일반 브라우저에서는 브릿지로 전파하지 않는다', () => {
        const { result } = renderHook(() => useDebugMode());
        tap(result.current.registerTap, 10);
        expect(setDebugModeMock).not.toHaveBeenCalled();
    });

    it('네이티브가 주입한 CHATIC_APP_DEBUG_MODE 전역이 true면 언락 상태로 시작한다', () => {
        (window as unknown as { CHATIC_APP_DEBUG_MODE?: boolean }).CHATIC_APP_DEBUG_MODE = true;
        const { result } = renderHook(() => useDebugMode());
        expect(result.current.isEnabled).toBe(true);
    });
});
