import { renderHook } from '@testing-library/react';
import { logHub } from '@chatic/logger';
import { useLogHandler } from './useLogHandler';
import type { WebMessageData } from '@chatic/app-messages';
import type { LogEntry } from '@chatic/logger';

const sendLog = (data: Partial<WebMessageData<'SendLog'>['data']>): WebMessageData<'SendLog'> =>
    ({
        type: 'SendLog',
        data: { message: 'msg', ...data },
    }) as WebMessageData<'SendLog'>;

/**
 * The relayed entry is observed through the hub — the merged ring buffer is
 * gone, so publication to the hub IS the delivery: it is what feeds the app's
 * other subscribers (the Crashlytics breadcrumb sink and, in dev, the console
 * mirror). A subscriber must be installed before the handler runs.
 */
const collect = () => {
    const entries: LogEntry[] = [];
    const unsubscribe = logHub.subscribe(entry => entries.push(entry));
    return { entries, unsubscribe };
};

describe('useLogHandler', () => {
    it('원본 tag·발생 시각·source를 보존한 채 hub로 발행한다', async () => {
        const { result } = renderHook(() => useLogHandler());
        const { entries, unsubscribe } = collect();

        const res = await result.current.handleSendLog(
            sendLog({ level: 'warn', tag: 'SOCKET', timestamp: 1234, source: 'web', data: { id: 1 } })
        );

        unsubscribe();
        // Returns no response — the host reads this as "no response" and skips sending a downstream
        // message. The web sends this up without a refId, so that response would be discarded
        // anyway, but every discarded response used to spin the UI thread once, burning a bridge
        // round trip for every single log.
        expect(res).toBeUndefined();
        const [entry] = entries;
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
        const { entries, unsubscribe } = collect();

        await result.current.handleSendLog(
            sendLog({ level: 'error', tag: 'AUTH', timestamp: 5, error, data: { ctx: 'login' } })
        );

        unsubscribe();
        const [entry] = entries;
        expect(entry.error).toEqual(error);
        expect(entry.data).toEqual({ ctx: 'login' });
    });

    it('구버전 웹(timestamp·tag·source 부재)은 수신 시각·WEBVIEW·web으로 폴백한다', async () => {
        const { result } = renderHook(() => useLogHandler());
        const { entries, unsubscribe } = collect();
        const before = Date.now();

        await result.current.handleSendLog(sendLog({}));

        unsubscribe();
        const [entry] = entries;
        expect(entry.tag).toBe('WEBVIEW');
        expect(entry.source).toBe('web');
        expect(entry.level).toBe('info');
        expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('웹이 실어 보낸 id와 발생 시점 컨텍스트를 보존한다', async () => {
        // In the hybrid setup, this entry is also sitting in the web's upload queue, and the app
        // queue receives the same entry. The id must survive so the server overwrites the same
        // document instead of leaving a duplicate.
        const { result } = renderHook(() => useLogHandler());
        const { entries, unsubscribe } = collect();

        await result.current.handleSendLog(
            sendLog({
                id: 'web-entry-1',
                runId: 'run-7',
                uid: 'u-7',
                cid: 'c-7',
                route: '/chat/7',
                webVersion: '0.45.0',
                timestamp: 900,
            })
        );

        unsubscribe();
        expect(entries[0]).toMatchObject({
            id: 'web-entry-1',
            runId: 'run-7',
            uid: 'u-7',
            cid: 'c-7',
            route: '/chat/7',
            webVersion: '0.45.0',
            timestamp: 900,
        });
    });

    it('id 없이 온 구버전 웹 로그에는 id가 채워진다', async () => {
        const { result } = renderHook(() => useLogHandler());
        const { entries, unsubscribe } = collect();

        await result.current.handleSendLog(sendLog({ timestamp: 800 }));

        unsubscribe();
        const [entry] = entries;
        expect(entry.id).toEqual(expect.any(String));
        expect(entry.timestamp).toBe(800);
    });
});
