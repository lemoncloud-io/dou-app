import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';

import { createInviteAcceptTracer } from './inviteAcceptTrace';

describe('createInviteAcceptTracer', () => {
    const backend = { start: jest.fn(), stop: jest.fn() };

    beforeEach(() => {
        backend.start.mockClear();
        backend.stop.mockClear();
        configurePerfTraces(backend);
    });

    afterEach(() => resetPerfTraces());

    it('records one invite_accept with its lane, outcome and phase marks', () => {
        const begin = createInviteAcceptTracer({ isHidden: () => false });
        const trace = begin('cloud');

        trace.mark('login');
        trace.mark('cloud');
        trace.end('ok');

        expect(backend.stop).toHaveBeenCalledTimes(1);
        const result = backend.stop.mock.calls[0][0];
        expect(result).toMatchObject({ name: 'invite_accept', attributes: { lane: 'cloud', outcome: 'ok' } });
        expect(Object.keys(result.metrics)).toEqual(['login', 'cloud']);
    });

    it('names the failed step on an error', () => {
        const begin = createInviteAcceptTracer({ isHidden: () => false });

        begin('relay').end('error', { step: 'accept' });

        expect(backend.stop.mock.calls[0][0].attributes).toEqual({ lane: 'relay', step: 'accept', outcome: 'error' });
    });

    it('keeps the first outcome when a run ends twice', () => {
        const begin = createInviteAcceptTracer({ isHidden: () => false });
        const trace = begin('relay');

        trace.end('verify');
        trace.end('error', { step: 'accept' });

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop.mock.calls[0][0].attributes).toEqual({ lane: 'relay', outcome: 'verify' });
    });

    it('times nothing while the page is hidden', () => {
        const begin = createInviteAcceptTracer({ isHidden: () => true });

        begin('cloud').end('ok');

        expect(backend.start).not.toHaveBeenCalled();
        expect(backend.stop).not.toHaveBeenCalled();
    });

    it('drops a run the page was hidden during, leaving its trace unstopped', () => {
        let hides = 0;
        const begin = createInviteAcceptTracer({ isHidden: () => false, hideCount: () => hides });
        const trace = begin('cloud');

        hides += 1;
        trace.end('ok');

        expect(backend.start).toHaveBeenCalledTimes(1);
        expect(backend.stop).not.toHaveBeenCalled();
    });
});
