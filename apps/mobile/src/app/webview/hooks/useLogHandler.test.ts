import { renderHook } from '@testing-library/react';
import { logBuffer } from '@chatic/logger';
import { useLogHandler } from './useLogHandler';
import type { WebMessageData } from '@chatic/app-messages';

const sendLog = (data: Partial<WebMessageData<'SendLog'>['data']>): WebMessageData<'SendLog'> =>
    ({
        type: 'SendLog',
        data: { message: 'msg', ...data },
    }) as WebMessageData<'SendLog'>;

describe('useLogHandler', () => {
    afterEach(() => {
        logBuffer.clear();
    });

    it('원본 tag·발생 시각·source를 보존한 채 통합 버퍼에 적재한다', async () => {
        const { result } = renderHook(() => useLogHandler());

        const res = await result.current.handleSendLog(
            sendLog({ level: 'warn', tag: 'SOCKET', timestamp: 1234, source: 'web', data: { id: 1 } })
        );

        expect(res).toEqual({ type: 'OnSendLog', success: true });
        const [entry] = logBuffer.peek();
        expect(entry).toMatchObject({
            level: 'warn',
            tag: 'SOCKET',
            message: 'msg',
            timestamp: 1234,
            source: 'web',
            data: { id: 1 },
        });
    });

    it('error와 data가 함께 실린다 (기존 either/or 유실 제거)', async () => {
        const { result } = renderHook(() => useLogHandler());
        const error = { name: 'Error', message: 'boom' };

        await result.current.handleSendLog(
            sendLog({ level: 'error', tag: 'AUTH', timestamp: 5, error, data: { ctx: 'login' } })
        );

        const [entry] = logBuffer.peek();
        expect(entry.error).toEqual(error);
        expect(entry.data).toEqual({ ctx: 'login' });
    });

    it('구버전 웹(timestamp·tag·source 부재)은 수신 시각·WEBVIEW·web으로 폴백한다', async () => {
        const { result } = renderHook(() => useLogHandler());
        const before = Date.now();

        await result.current.handleSendLog(sendLog({}));

        const [entry] = logBuffer.peek();
        expect(entry.tag).toBe('WEBVIEW');
        expect(entry.source).toBe('web');
        expect(entry.level).toBe('info');
        expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    });
});
