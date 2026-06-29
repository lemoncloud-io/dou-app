import { act, renderHook } from '@testing-library/react';

import { useDebugMode } from './useDebugMode';
import { DEBUG_STORAGE_KEY } from '../consts';

const tap = (registerTap: () => void, times: number) =>
    act(() => {
        for (let i = 0; i < times; i++) registerTap();
    });

describe('useDebugMode — 숨겨진 디버그 모드 게이트', () => {
    beforeEach(() => {
        sessionStorage.clear();
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
});
