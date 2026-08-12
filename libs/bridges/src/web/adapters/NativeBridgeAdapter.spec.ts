import { logBuffer, logHub, logger } from '@chatic/logger';

import { createNativeForwarder } from '../../logger/nativeForwarder';
import { NativeBridgeAdapter } from './NativeBridgeAdapter';

/**
 * The two paths through this adapter have opposite logging rules, and getting
 * them backwards is not a style slip — it hangs the app. `createNativeForwarder`
 * calls `postMessage` for every log entry, so a `logger` call inside the
 * outbound path feeds itself. The inbound path has no such loop, and staying on
 * `console` there would keep real handler crashes out of report breadcrumbs.
 */
describe('NativeBridgeAdapter — 로깅 경로 제약', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    beforeEach(() => {
        jest.clearAllMocks();
        logBuffer.clear();
        delete (window as { ReactNativeWebView?: unknown }).ReactNativeWebView;
        delete (window as { ChaticMessageHandler?: unknown }).ChaticMessageHandler;
        delete (window as { webkit?: unknown }).webkit;
    });

    afterAll(() => {
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('송신(postMessage) — logger 를 쓰면 안 된다', () => {
        it('네이티브 인터페이스가 없어도 로그 버퍼를 건드리지 않는다', () => {
            new NativeBridgeAdapter().postMessage({ type: 'X' } as never);

            expect(consoleWarnSpy).toHaveBeenCalled();
            expect(logBuffer.size()).toBe(0);
        });

        // 이 테스트가 곧 재귀 방지 계약이다: forwarder 를 구독시킨 상태에서 전송이
        // 실패해도 새 로그가 생기지 않아야, 로그 → 전송 → 실패 → 로그 루프가 없다.
        it('nativeForwarder 가 붙어 있어도 전송 실패가 새 로그를 만들지 않는다', () => {
            const unsubscribe = logHub.subscribe(createNativeForwarder());

            try {
                logger.info('TEST', 'entry that gets forwarded');
                const afterFirst = logBuffer.size();

                logger.info('TEST', 'second entry');

                // 정확히 1건씩만 늘어난다 — forwarder 의 전송 실패가 로그를 되먹이면
                // 이 값이 폭주하거나 스택 오버플로로 죽는다.
                expect(logBuffer.size()).toBe(afterFirst + 1);
            } finally {
                unsubscribe();
            }
        });
    });

    describe('수신(handleNativeMessage) — logger 를 써야 한다', () => {
        it('수신 핸들러가 던지면 로그 버퍼에 남겨 breadcrumb 으로 살린다', () => {
            const adapter = new NativeBridgeAdapter();
            adapter.onMessage(() => {
                throw new Error('handler blew up');
            });

            window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'SomeEvent' }) }));

            const entries = logBuffer.peek();
            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({ level: 'error', tag: 'BRIDGE' });
        });
    });
});
