import { act, renderHook } from '@testing-library/react';

import { useDebugOperation } from './useDebugOperation';

jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));

describe('useDebugOperation', () => {
    it('아직 아무것도 안 했으면 표시할 줄이 없다', () => {
        const { result } = renderHook(() => useDebugOperation());

        expect(result.current.result).toBeNull();
    });

    it('run은 응답 본문을 줄에 적는다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('토큰', () => Promise.resolve({ data: { token: 'abc' } })));

        expect(result.current.result).toBe('토큰 → {"token":"abc"}');
    });

    it('data가 없는 응답은 ok로 적는다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('비우기', () => Promise.resolve({})));

        expect(result.current.result).toBe('비우기 → ok');
    });

    // 구버전 앱이 명령을 모르면 reject된다. 실패를 성공으로 뭉개지 않는 것이 이 훅의 요점.
    it('reject는 실패로 적는다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('토큰', () => Promise.reject(new Error('NOT_FOUND'))));

        expect(result.current.result).toBe('토큰 → 실패: NOT_FOUND');
    });

    it('긴 응답은 잘라서 버튼을 밀어내지 않는다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('목록', () => Promise.resolve({ data: 'x'.repeat(900) })));

        expect(result.current.result?.length).toBeLessThan(430);
    });

    // post 기반 명령은 답이 없다 — 받은 척하면 결정 10을 어긴다.
    it('fire는 확인이 없다는 사실을 밝힌다', () => {
        const operation = jest.fn();
        const { result } = renderHook(() => useDebugOperation());

        act(() => result.current.fire('설정 열기', operation));

        expect(operation).toHaveBeenCalledTimes(1);
        expect(result.current.result).toBe('설정 열기 → 보냈습니다 (확인 없음)');
    });
});
