import { configurePerfTraces, resetPerfTraces, startPerfTrace } from '@chatic/perf';

import { CHAT_SEND_TRACES_PER_MINUTE, createChatSendTracer } from './chatSendTrace';

describe('createChatSendTracer', () => {
    const backend = { start: jest.fn(), stop: jest.fn() };

    beforeEach(() => {
        backend.start.mockClear();
        backend.stop.mockClear();
        configurePerfTraces(backend);
    });

    afterEach(() => resetPerfTraces());

    it('records one chat_send with its thread kind and outcome', () => {
        const begin = createChatSendTracer({ isHidden: () => false });

        begin({ reply: true }).end('ok');

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'chat_send', attributes: { thread: 'reply', kind: 'text', outcome: 'ok' } })
        );
    });

    it('keeps the first outcome when a send ends twice', () => {
        const begin = createChatSendTracer({ isHidden: () => false });
        const trace = begin({ reply: false });

        trace.end('error');
        trace.end('ok');

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop.mock.calls[0][0].attributes).toMatchObject({ thread: 'root', outcome: 'error' });
    });

    it('times nothing while the page is hidden', () => {
        const begin = createChatSendTracer({ isHidden: () => true });

        begin({ reply: false }).end('ok');

        expect(backend.start).not.toHaveBeenCalled();
        expect(backend.stop).not.toHaveBeenCalled();
    });

    it('drops a send the page was hidden during, leaving its trace unstopped', () => {
        let hides = 0;
        const begin = createChatSendTracer({ isHidden: () => false, hideCount: () => hides });
        const trace = begin({ reply: false });

        hides += 1;
        trace.end('ok');

        expect(backend.start).toHaveBeenCalledTimes(1);
        expect(backend.stop).not.toHaveBeenCalled();
    });

    it('caps the traces a minute, and starts again in the next minute', () => {
        let now = 0;
        const start = jest.fn(startPerfTrace);
        const begin = createChatSendTracer({ isHidden: () => false, now: () => now, start });

        for (let i = 0; i < CHAT_SEND_TRACES_PER_MINUTE + 3; i++) begin({ reply: false }).end('ok');
        expect(start).toHaveBeenCalledTimes(CHAT_SEND_TRACES_PER_MINUTE);

        now = 60_000;
        begin({ reply: false }).end('ok');
        expect(start).toHaveBeenCalledTimes(CHAT_SEND_TRACES_PER_MINUTE + 1);
    });
});
