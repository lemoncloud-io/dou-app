import { act, renderHook } from '@testing-library/react';

import { useDebugOperation } from './useDebugOperation';
import { setDebugLanguageForTests } from '../i18n';

jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

describe('useDebugOperation', () => {
    let restoreLanguage: () => void;

    beforeEach(() => {
        restoreLanguage = setDebugLanguageForTests('en');
    });
    afterEach(() => restoreLanguage());

    it('아직 아무것도 안 했으면 표시할 줄이 없다', () => {
        const { result } = renderHook(() => useDebugOperation());

        expect(result.current.result).toBeNull();
    });

    it('run은 응답 본문을 줄에 적는다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('Token', () => Promise.resolve({ data: { token: 'abc' } })));

        expect(result.current.result).toBe('Token → {"token":"abc"}');
    });

    it('data가 없는 응답은 ok로 적는다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('Clear', () => Promise.resolve({})));

        expect(result.current.result).toBe('Clear → ok');
    });

    // An older app version rejects when it doesn't know the command. Not smoothing a failure over as a success is the whole point of this hook.
    it('reject는 실패로 적는다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('Token', () => Promise.reject(new Error('NOT_FOUND'))));

        expect(result.current.result).toBe('Token → failed: NOT_FOUND');
    });

    it('긴 응답은 잘라서 버튼을 밀어내지 않는다', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('List', () => Promise.resolve({ data: 'x'.repeat(900) })));

        expect(result.current.result?.length).toBeLessThan(430);
    });

    // A post-based command gets no reply — pretending it was acknowledged would violate decision 10.
    it('fire는 확인이 없다는 사실을 밝힌다', () => {
        const operation = jest.fn();
        const { result } = renderHook(() => useDebugOperation());

        act(() => result.current.fire('Open settings', operation));

        expect(operation).toHaveBeenCalledTimes(1);
        expect(result.current.result).toBe('Open settings → sent (no confirmation)');
    });

    it('reports a rejection as a failure, NOT_FOUND included', async () => {
        const { result } = renderHook(() => useDebugOperation());

        await act(() => result.current.run('Boot records', () => Promise.reject(new Error('network'))));
        expect(result.current.result).toBe('Boot records → failed: network');

        await act(() =>
            result.current.run('Boot records', () => Promise.reject({ code: 'NOT_FOUND', message: 'No handler' }))
        );
        expect(result.current.result).toBe('Boot records → failed: No handler');
    });
});
