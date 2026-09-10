// Mock the bridge so the hook's native propagation is observable and jsdom
// never touches the real webClient.
jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
jest.mock('../../../bridge', () => ({ appBridge: { setDebugMode: jest.fn() } }));
// The registry decides visibility by build stage (ADR-0080 결정 4); the facade is mocked so the
// stage rule can be stated per test instead of standing up ports.
const configGet = jest.fn();
const configSet = jest.fn();
const configClear = jest.fn();
jest.mock('@chatic/config', () => ({
    config: {
        get: (key: string) => configGet(key),
        set: (key: string, value: unknown, options: unknown) => configSet(key, value, options),
        clear: (key: string, options: unknown) => configClear(key, options),
        subscribe: () => () => undefined,
    },
    CONFIG_UNLOCK_KEY: 'system.overridesUnlocked',
}));

import { act, renderHook } from '@testing-library/react';

import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { setDebugModeEnabled, useDebugMode } from './useDebugMode';
import { DEBUG_STORAGE_KEY } from '../consts';

const isNativeMock = isNative as jest.Mock;
const setDebugModeMock = appBridge.setDebugMode as jest.Mock;

describe('useDebugMode — 숨겨진 디버그 모드 게이트', () => {
    beforeEach(() => {
        sessionStorage.clear();
        jest.clearAllMocks();
        isNativeMock.mockReturnValue(false);
        configGet.mockReturnValue(undefined);
        delete (window as unknown as { CHATIC_APP_DEBUG_MODE?: boolean }).CHATIC_APP_DEBUG_MODE;
    });

    // LOCAL/DEV는 행이 true라 10탭 마찰이 사라진다. PROD는 행이 false라 지금과 똑같다.
    it('스테이지 행이 열려 있으면 언락 없이 활성이다', () => {
        configGet.mockImplementation((key: string) => (key === 'debug.overlayEnabled' ? true : undefined));
        const { result } = renderHook(() => useDebugMode());
        expect(result.current.isEnabled).toBe(true);
    });

    // 언락 기록만 지우면 스테이지 규칙이 다시 켜므로 "웹이 다시 끌 수 있다"가 거짓이 된다.
    it('disable은 스테이지 행도 false로 쓴다', () => {
        sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
        const { result } = renderHook(() => useDebugMode());

        act(() => result.current.disable());

        expect(configSet).toHaveBeenCalledWith('debug.overlayEnabled', false, { lane: 'local' });
    });

    // 이 배선이 없으면 PROD에서 surface:'dev' 키가 전부 읽기 전용으로 뜬다.
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
        // The always-mounted debug overlay must react to useDebugUnlock's unlock call.
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
