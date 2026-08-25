import { logHub, logger } from '@chatic/logger';

import { createNativeForwarder } from '../../logger/nativeForwarder';
import { NativeBridgeAdapter } from './NativeBridgeAdapter';

import type { LogEntry } from '@chatic/logger';

/**
 * The two paths through this adapter have opposite logging rules, and getting
 * them backwards is not a style slip — it hangs the app. `createNativeForwarder`
 * calls `postMessage` for every log entry, so a `logger` call inside the
 * outbound path feeds itself. The inbound path has no such loop, and staying on
 * `console` there would keep real handler crashes out of report breadcrumbs.
 *
 * The ring buffer these cases used to count is gone, so "did this produce a log
 * entry?" is now answered by a hub subscriber that counts what it receives. The
 * subscriber has to be installed before the action under test: the hub delivers
 * only to whoever is subscribed at publish time.
 */
describe('NativeBridgeAdapter — 로깅 경로 제약', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    let cleanups: Array<() => void> = [];

    const collect = () => {
        const entries: LogEntry[] = [];
        cleanups.push(logHub.subscribe(entry => entries.push(entry)));
        return entries;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        delete (window as { ReactNativeWebView?: unknown }).ReactNativeWebView;
        delete (window as { ChaticMessageHandler?: unknown }).ChaticMessageHandler;
        delete (window as { webkit?: unknown }).webkit;
    });

    afterEach(() => {
        // The hub is a process-wide singleton, so a subscription left attached
        // would keep the next case from starting at zero. Unsubscribing is what
        // `logBuffer.clear()` used to do for isolation.
        cleanups.forEach(cleanup => cleanup());
        cleanups = [];
    });

    afterAll(() => {
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('송신(postMessage) — logger 를 쓰면 안 된다', () => {
        it('네이티브 인터페이스가 없어도 로그 엔트리를 만들지 않는다', () => {
            const entries = collect();

            new NativeBridgeAdapter().postMessage({ type: 'X' } as never);

            expect(consoleWarnSpy).toHaveBeenCalled();
            expect(entries).toHaveLength(0);
        });

        // 이 테스트가 곧 재귀 방지 계약이다: forwarder 를 구독시킨 상태에서 전송이
        // 실패해도 새 로그가 생기지 않아야, 로그 → 전송 → 실패 → 로그 루프가 없다.
        it('nativeForwarder 가 붙어 있어도 전송 실패가 새 로그를 만들지 않는다', () => {
            const entries = collect();
            cleanups.push(logHub.subscribe(createNativeForwarder()));

            logger.info('TEST', 'entry that gets forwarded');
            const afterFirst = entries.length;

            logger.info('TEST', 'second entry');

            // 정확히 1건씩만 늘어난다 — forwarder 의 전송 실패가 로그를 되먹이면
            // 이 값이 폭주하거나 스택 오버플로로 죽는다.
            expect(afterFirst).toBe(1);
            expect(entries).toHaveLength(afterFirst + 1);
        });
    });

    describe('수신(handleNativeMessage) — logger 를 써야 한다', () => {
        it('수신 핸들러가 던지면 hub 로 발행해 breadcrumb 으로 살린다', () => {
            const entries = collect();
            const adapter = new NativeBridgeAdapter();
            cleanups.push(
                adapter.onMessage(() => {
                    throw new Error('handler blew up');
                })
            );

            window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'SomeEvent' }) }));

            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({ level: 'error', tag: 'BRIDGE' });
        });
    });
});
