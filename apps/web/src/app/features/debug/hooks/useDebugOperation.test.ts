import { act, renderHook } from '@testing-library/react';

import { resetUnsupportedCommands, useDebugOperation } from './useDebugOperation';

jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

describe('useDebugOperation', () => {
    beforeEach(() => resetUnsupportedCommands());

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

    // An older app version rejects when it doesn't know the command. Not smoothing a failure over as a success is the whole point of this hook.
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

    // A post-based command gets no reply — pretending it was acknowledged would violate decision 10.
    it('fire는 확인이 없다는 사실을 밝힌다', () => {
        const operation = jest.fn();
        const { result } = renderHook(() => useDebugOperation());

        act(() => result.current.fire('설정 열기', operation));

        expect(operation).toHaveBeenCalledTimes(1);
        expect(result.current.result).toBe('설정 열기 → 보냈습니다 (확인 없음)');
    });

    // Since the web ships before the app, there's inevitably a window where an older app has no
    // handler. Showing the host's raw message ("등록된 핸들러를 찾을 수 없습니다") as-is would send
    // someone chasing a version gap as if it were a bug.
    it('NOT_FOUND는 실패가 아니라 버전 차이로 말한다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() =>
            result.current.run('부팅 기록', () => Promise.reject({ code: 'NOT_FOUND', message: '핸들러 없음' }))
        );

        expect(result.current.result).toBe('부팅 기록 → 이 앱 버전이 지원하지 않습니다');
    });

    it('명령 이름을 주면 기억해 두고, 화면이 버튼을 잠글 수 있게 한다', async () => {
        const { result } = renderHook(() => useDebugOperation());
        expect(result.current.isUnsupported('FetchBootRecords')).toBe(false);

        await act(() =>
            result.current.run('부팅 기록', () => Promise.reject({ code: 'NOT_FOUND' }), 'FetchBootRecords')
        );

        expect(result.current.isUnsupported('FetchBootRecords')).toBe(true);
        // Other commands must not be locked too — the app only doesn't know that one.
        expect(result.current.isUnsupported('DeleteFcmToken')).toBe(false);
    });

    it('명령 이름이 없으면 기억하지 않는다 — 무엇을 잠글지 알 수 없다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('무명', () => Promise.reject({ code: 'NOT_FOUND' })));

        expect(result.current.isUnsupported('무명')).toBe(false);
    });

    it('일반 실패는 기억하지 않는다 — 다시 시도할 수 있어야 한다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() =>
            result.current.run('부팅 기록', () => Promise.reject(new Error('network')), 'FetchBootRecords')
        );

        expect(result.current.result).toBe('부팅 기록 → 실패: network');
        expect(result.current.isUnsupported('FetchBootRecords')).toBe(false);
    });
});
