const mockIsNative = jest.fn();
const mockSetHostDebugMode = jest.fn();
jest.mock('@chatic/runtime', () => {
    const testing = require('@chatic/runtime/testing');
    return testing.fakeRuntimeModule({
        get diagnostics() {
            return {
                ...testing.browserDiagnostics(),
                ...(mockIsNative() ? { kind: 'shell', debugMode: { set: mockSetHostDebugMode } } : {}),
            };
        },
        settings: {
            get: (key: string) => configGet(key),
            set: (key: string, value: unknown, options: unknown) => configSet(key, value, options),
            clear: (key: string, options: unknown) => configClear(key, options),
            subscribe: () => () => undefined,
            CONFIG_UNLOCK_KEY: 'system.overridesUnlocked',
        },
    });
});
const configGet = jest.fn();
const configSet = jest.fn();
const configClear = jest.fn();

import { act, renderHook } from '@testing-library/react';

import { setDebugModeEnabled, useDebugMode } from './useDebugMode';
import { DEBUG_STORAGE_KEY } from '../consts';

const isNativeMock = mockIsNative;
const setDebugModeMock = mockSetHostDebugMode;

describe('useDebugMode — 숨겨진 디버그 모드 게이트', () => {
    beforeEach(() => {
        sessionStorage.clear();
        jest.clearAllMocks();
        isNativeMock.mockReturnValue(false);
        configGet.mockReturnValue(undefined);
        delete (window as unknown as { CHATIC_APP_DEBUG_MODE?: boolean }).CHATIC_APP_DEBUG_MODE;
    });

    it('스테이지 행이 열려 있으면 언락 없이 활성이다', () => {
        configGet.mockImplementation((key: string) => (key === 'debug.overlayEnabled' ? true : undefined));
        const { result } = renderHook(() => useDebugMode());
        expect(result.current.isEnabled).toBe(true);
    });

    it('disable은 스테이지 행도 false로 쓴다', () => {
        sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
        const { result } = renderHook(() => useDebugMode());

        act(() => result.current.disable());

        expect(configSet).toHaveBeenCalledWith('debug.overlayEnabled', false, { lane: 'local' });
    });

    it('언락은 오버라이드 잠금도 연다', () => {
        act(() => setDebugModeEnabled(true));

        expect(configSet).toHaveBeenCalledWith('system.overridesUnlocked', true, { lane: 'local' });
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

    it('disable는 디버그 모드를 끄고 플래그를 제거한다', () => {
        sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
        const { result } = renderHook(() => useDebugMode());
        expect(result.current.isEnabled).toBe(true);

        act(() => result.current.disable());

        expect(result.current.isEnabled).toBe(false);
        expect(sessionStorage.getItem(DEBUG_STORAGE_KEY)).toBeNull();
    });

    it('setDebugModeEnabled(true)로 언락하면 모든 훅 인스턴스가 즉시 활성화된다', () => {
        const observer = renderHook(() => useDebugMode());
        expect(observer.result.current.isEnabled).toBe(false);

        act(() => setDebugModeEnabled(true));

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
        act(() => setDebugModeEnabled(true));
        expect(setDebugModeMock).toHaveBeenCalledWith(true);

        const { result } = renderHook(() => useDebugMode());
        act(() => result.current.disable());
        expect(setDebugModeMock).toHaveBeenLastCalledWith(false);
    });

    it('일반 브라우저에서는 브릿지로 전파하지 않는다', () => {
        act(() => setDebugModeEnabled(true));
        expect(setDebugModeMock).not.toHaveBeenCalled();
    });

    it('네이티브가 주입한 CHATIC_APP_DEBUG_MODE 전역이 true면 언락 상태로 시작한다', () => {
        (window as unknown as { CHATIC_APP_DEBUG_MODE?: boolean }).CHATIC_APP_DEBUG_MODE = true;
        const { result } = renderHook(() => useDebugMode());
        expect(result.current.isEnabled).toBe(true);
    });
});
