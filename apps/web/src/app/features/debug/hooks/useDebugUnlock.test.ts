// useDebugMode (imported for the cross-hook sync test) pulls in the real appBridge chain,
// which reaches webTransport's `import.meta.env` read — unparseable under ts-jest's
// CommonJS transform. Mock the bridge at the same boundary useDebugMode.test.ts does.
jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
jest.mock('../../../bridge', () => ({ appBridge: { setDebugMode: jest.fn() } }));

import { act, renderHook } from '@testing-library/react';

import { useDebugMode } from './useDebugMode';
import { useDebugUnlock } from './useDebugUnlock';
import { DEBUG_STORAGE_KEY } from '../consts';

const CODE = '123456';

const tap = (registerTap: () => void, times: number) =>
    act(() => {
        for (let i = 0; i < times; i++) registerTap();
    });

describe('useDebugUnlock — 10탭 + 입장 코드 게이트', () => {
    beforeEach(() => {
        sessionStorage.clear();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('10회 탭하면 코드가 설정된 경우 챌린지가 열린다', () => {
        const { result } = renderHook(() => useDebugUnlock(CODE));
        tap(result.current.registerTap, 10);
        expect(result.current.isChallengeOpen).toBe(true);
    });

    it('9회 탭으로는 챌린지가 열리지 않는다', () => {
        const { result } = renderHook(() => useDebugUnlock(CODE));
        tap(result.current.registerTap, 9);
        expect(result.current.isChallengeOpen).toBe(false);
    });

    it('3초가 지나면 탭 카운트가 초기화되어 누적되지 않는다', () => {
        const { result } = renderHook(() => useDebugUnlock(CODE));
        tap(result.current.registerTap, 5);
        act(() => {
            jest.advanceTimersByTime(3000);
        });
        tap(result.current.registerTap, 5);
        expect(result.current.isChallengeOpen).toBe(false);
    });

    it('코드가 설정되지 않으면 10탭해도 아무 반응이 없다(fail-closed)', () => {
        const { result } = renderHook(() => useDebugUnlock(undefined));
        tap(result.current.registerTap, 10);
        expect(result.current.isChallengeOpen).toBe(false);
    });

    it('정답 코드를 제출하면 디버그 모드가 언락되고 챌린지가 닫힌다', () => {
        const { result } = renderHook(() => useDebugUnlock(CODE));
        tap(result.current.registerTap, 10);

        let submitted = false;
        act(() => {
            submitted = result.current.submitCode(CODE);
        });

        expect(submitted).toBe(true);
        expect(result.current.isChallengeOpen).toBe(false);
        expect(sessionStorage.getItem(DEBUG_STORAGE_KEY)).toBe('true');
    });

    it('오답을 제출하면 에러 상태가 되지만 챌린지는 열려 있다', () => {
        const { result } = renderHook(() => useDebugUnlock(CODE));
        tap(result.current.registerTap, 10);

        act(() => {
            result.current.submitCode('000000');
        });

        expect(result.current.hasError).toBe(true);
        expect(result.current.isChallengeOpen).toBe(true);
    });

    it('3회 오답을 제출하면 챌린지가 닫히고 탭 카운터가 리셋된다', () => {
        const { result } = renderHook(() => useDebugUnlock(CODE));
        tap(result.current.registerTap, 10);

        act(() => {
            result.current.submitCode('000000');
        });
        act(() => {
            result.current.submitCode('000000');
        });
        act(() => {
            result.current.submitCode('000000');
        });

        expect(result.current.isChallengeOpen).toBe(false);
        expect(sessionStorage.getItem(DEBUG_STORAGE_KEY)).toBeNull();

        // Reset means the unlock must start over from a fresh 10-tap, not resume mid-count.
        tap(result.current.registerTap, 9);
        expect(result.current.isChallengeOpen).toBe(false);
    });

    it('취소하면 챌린지가 닫히고 탭 카운터가 리셋된다', () => {
        const { result } = renderHook(() => useDebugUnlock(CODE));
        tap(result.current.registerTap, 10);

        act(() => {
            result.current.cancelChallenge();
        });

        expect(result.current.isChallengeOpen).toBe(false);
        tap(result.current.registerTap, 9);
        expect(result.current.isChallengeOpen).toBe(false);
    });

    it('언락에 성공하면 이미 마운트된 useDebugMode 인스턴스도 즉시 활성화된다', () => {
        const unlocker = renderHook(() => useDebugUnlock(CODE));
        const observer = renderHook(() => useDebugMode());
        expect(observer.result.current.isEnabled).toBe(false);

        tap(unlocker.result.current.registerTap, 10);
        act(() => {
            unlocker.result.current.submitCode(CODE);
        });

        expect(observer.result.current.isEnabled).toBe(true);
    });
});
