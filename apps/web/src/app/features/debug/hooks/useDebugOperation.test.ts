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

    // 웹이 앱보다 먼저 배포되므로 구버전 앱에서 핸들러가 없는 구간이 반드시 생긴다. 호스트의
    // 원문("등록된 핸들러를 찾을 수 없습니다")을 그대로 보여주면 버전 차이를 버그로 쫓게 된다.
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
        // 다른 명령까지 잠기면 안 된다 — 앱이 모르는 것은 그 하나다.
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
