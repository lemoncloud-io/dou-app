import { createPairingRequestFlow, type PairingRequestState } from './pairingRequestFlow';

const CODE = { pairingId: 'p-1', code: '07344168', expiredAt: 1_000_000, interval: 5 };
const httpError = (status?: number) => Object.assign(new Error(`status ${status}`), { response: { status } });

const setup = () => {
    let clock = 0;
    const timers: Array<{ at: number; run: () => void; id: number }> = [];
    let nextId = 1;
    const states: PairingRequestState[] = [];
    const deps = {
        request: jest.fn().mockResolvedValue(CODE),
        claim: jest.fn().mockResolvedValue({ status: 'pending' }),
        applySession: jest.fn().mockResolvedValue(undefined),
        enterCloud: jest.fn().mockResolvedValue(undefined),
        onChange: (state: PairingRequestState) => states.push(state),
        now: () => clock,
        schedule: (run: () => void, ms: number) => {
            const id = nextId++;
            timers.push({ at: clock + ms, run, id });
            return id;
        },
        cancel: (id: unknown) => {
            const i = timers.findIndex(t => t.id === id);
            if (i >= 0) timers.splice(i, 1);
        },
    };
    const flow = createPairingRequestFlow(deps);
    /** Lets every pending promise settle. */
    const settle = async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    /** Moves the clock and runs the timers that came due, settling after each. */
    const advance = async (ms: number) => {
        const end = clock + ms;
        for (;;) {
            const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
            if (!due) break;
            timers.splice(timers.indexOf(due), 1);
            clock = Math.max(clock, due.at);
            due.run();
            await settle();
        }
        clock = end;
    };
    return { flow, deps, states, settle, advance, timers, setClock: (t: number) => (clock = t) };
};

describe('createPairingRequestFlow', () => {
    it('requests a code and shows it', async () => {
        const { flow, deps, settle } = setup();

        flow.start();
        await settle();

        expect(deps.request).toHaveBeenCalledTimes(1);
        expect(flow.getState()).toEqual({ phase: 'waiting', code: '07344168', expiredAt: 1_000_000, pairingId: 'p-1' });
    });

    it('claims every interval while pending, never two at once', async () => {
        const { flow, deps, settle, advance } = setup();
        let release: () => void = () => undefined;
        deps.claim.mockImplementationOnce(
            () => new Promise(resolve => (release = () => resolve({ status: 'pending' })))
        );

        flow.start();
        await settle();
        await advance(5000);
        expect(deps.claim).toHaveBeenCalledTimes(1);

        // The first claim is still out: no second one, however long it takes.
        await advance(20_000);
        expect(deps.claim).toHaveBeenCalledTimes(1);

        release();
        await settle();
        await advance(5000);
        expect(deps.claim).toHaveBeenCalledTimes(2);
    });

    it('applies a relay approval once and finishes', async () => {
        const { flow, deps, settle, advance } = setup();
        const session = { id: 'u-1', $auth: { id: 'a-1' } };
        deps.claim.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({
            status: 'approved',
            target: { type: 'relay' },
            approver: { name: 'developer' },
            session,
        });

        flow.start();
        await settle();
        await advance(10_000);

        expect(deps.applySession).toHaveBeenCalledTimes(1);
        expect(deps.applySession).toHaveBeenCalledWith(session);
        expect(flow.getState()).toEqual({ phase: 'done', target: { type: 'relay' }, approverName: 'developer' });
        await advance(60_000);
        expect(deps.claim).toHaveBeenCalledTimes(2);
    });

    it('enters the cloud of a cloud approval instead of applying a session', async () => {
        const { flow, deps, settle, advance } = setup();
        deps.claim.mockResolvedValueOnce({
            status: 'approved',
            target: { type: 'cloud', cloudId: '1000002' },
            approver: {},
        });

        flow.start();
        await settle();
        await advance(5000);

        expect(deps.enterCloud).toHaveBeenCalledWith('1000002');
        expect(deps.applySession).not.toHaveBeenCalled();
        expect(flow.getState()).toMatchObject({ phase: 'done', target: { type: 'cloud', cloudId: '1000002' } });
    });

    it('ends lost when applying the session throws', async () => {
        const { flow, deps, settle, advance } = setup();
        deps.claim.mockResolvedValueOnce({ status: 'approved', target: { type: 'relay' }, approver: {}, session: {} });
        deps.applySession.mockRejectedValueOnce(new Error('$auth.id missing'));

        flow.start();
        await settle();
        await advance(5000);

        expect(flow.getState()).toEqual({ phase: 'lost' });
    });

    it('ends lost on a relay approval that carries no session', async () => {
        const { flow, deps, settle, advance } = setup();
        deps.claim.mockResolvedValueOnce({ status: 'approved', target: { type: 'relay' }, approver: {} });

        flow.start();
        await settle();
        await advance(5000);

        expect(deps.applySession).not.toHaveBeenCalled();
        expect(flow.getState()).toEqual({ phase: 'lost' });
    });

    it.each([
        ['expired', { phase: 'expired', code: '07344168' }],
        ['denied', { phase: 'denied' }],
        ['claimed', { phase: 'lost' }],
        ['revoked', { phase: 'lost' }],
    ])('ends on a %s answer', async (status, expected) => {
        const { flow, deps, settle, advance } = setup();
        deps.claim.mockResolvedValueOnce({ status });

        flow.start();
        await settle();
        await advance(5000);

        expect(flow.getState()).toEqual(expected);
        await advance(60_000);
        expect(deps.claim).toHaveBeenCalledTimes(1);
    });

    it('keeps polling through network errors until the code expires', async () => {
        const { flow, deps, settle, advance, setClock } = setup();
        deps.claim.mockRejectedValueOnce(new Error('Network Error')).mockRejectedValueOnce(httpError(502));

        flow.start();
        await settle();
        await advance(15_000);

        expect(deps.claim).toHaveBeenCalledTimes(3);
        expect(flow.getState().phase).toBe('waiting');

        setClock(1_000_000);
        await advance(5000);
        expect(flow.getState()).toEqual({ phase: 'expired', code: '07344168' });
    });

    it('fails on a 4xx claim answer', async () => {
        const { flow, deps, settle, advance } = setup();
        deps.claim.mockRejectedValueOnce(httpError(403));

        flow.start();
        await settle();
        await advance(5000);

        expect(flow.getState()).toEqual({ phase: 'failed', status: 403 });
    });

    it('draws a new code once when the relay answers 503 (code busy)', async () => {
        const { flow, deps, settle } = setup();
        deps.request.mockRejectedValueOnce(httpError(503));

        flow.start();
        await settle();

        expect(deps.request).toHaveBeenCalledTimes(2);
        expect(flow.getState().phase).toBe('waiting');
    });

    it('fails when the request is refused, without retrying', async () => {
        const { flow, deps, settle } = setup();
        deps.request.mockRejectedValueOnce(httpError(403));

        flow.start();
        await settle();

        expect(deps.request).toHaveBeenCalledTimes(1);
        expect(flow.getState()).toEqual({ phase: 'failed', status: 403 });
    });

    it('stops polling when stopped, and resumes the same code when started again', async () => {
        const { flow, deps, settle, advance } = setup();

        flow.start();
        await settle();
        flow.stop();
        await advance(30_000);
        expect(deps.claim).not.toHaveBeenCalled();

        flow.start();
        await settle();
        await advance(0);
        expect(deps.request).toHaveBeenCalledTimes(1);
        expect(deps.claim).toHaveBeenCalledTimes(1);
    });

    // React's strict mode mounts, unmounts and mounts again before the first request settles.
    it('a stop and start while the first request is out sends one request, not two', async () => {
        const { flow, deps, settle } = setup();

        flow.start();
        flow.stop();
        flow.start();
        await settle();

        expect(deps.request).toHaveBeenCalledTimes(1);
        expect(flow.getState().phase).toBe('waiting');
    });

    it('still applies an approval that arrives after the screen stopped the flow', async () => {
        const { flow, deps, settle, advance } = setup();
        let release: () => void = () => undefined;
        deps.claim.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    release = () =>
                        resolve({ status: 'approved', target: { type: 'relay' }, approver: {}, session: { id: 'u' } });
                })
        );

        flow.start();
        await settle();
        await advance(5000);
        flow.stop();
        release();
        await settle();

        expect(deps.applySession).toHaveBeenCalledTimes(1);
        expect(flow.getState().phase).toBe('done');
    });

    it('restart asks for a new code and ignores the old code’s late answer', async () => {
        const { flow, deps, settle, advance } = setup();
        let release: () => void = () => undefined;
        deps.claim.mockImplementationOnce(
            () => new Promise(resolve => (release = () => resolve({ status: 'denied' })))
        );
        deps.request.mockResolvedValueOnce(CODE).mockResolvedValueOnce({ ...CODE, pairingId: 'p-2', code: '11112222' });

        flow.start();
        await settle();
        await advance(5000);
        flow.restart();
        await settle();
        release();
        await settle();

        expect(flow.getState()).toMatchObject({ phase: 'waiting', pairingId: 'p-2', code: '11112222' });
    });

    it('still claims once past the code lifetime, and takes an approval that landed at the end', async () => {
        const { flow, deps, settle, advance, setClock } = setup();
        deps.claim.mockResolvedValueOnce({
            status: 'approved',
            target: { type: 'relay' },
            approver: {},
            session: { id: 'u' },
        });

        flow.start();
        await settle();
        setClock(1_000_000);
        await advance(5000);

        expect(deps.claim).toHaveBeenCalledTimes(1);
        expect(deps.applySession).toHaveBeenCalledTimes(1);
        expect(flow.getState().phase).toBe('done');
    });

    it('expires after that last claim answers pending', async () => {
        const { flow, deps, settle, advance, setClock } = setup();

        flow.start();
        await settle();
        setClock(1_000_000);
        await advance(5000);

        expect(deps.claim).toHaveBeenCalledTimes(1);
        expect(flow.getState()).toEqual({ phase: 'expired', code: '07344168' });
    });

    it('takes an approval for a code that was replaced while its claim was out', async () => {
        const { flow, deps, settle, advance } = setup();
        let release: () => void = () => undefined;
        deps.claim.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    release = () =>
                        resolve({ status: 'approved', target: { type: 'relay' }, approver: {}, session: { id: 'u' } });
                })
        );
        deps.request.mockResolvedValueOnce(CODE).mockResolvedValueOnce({ ...CODE, pairingId: 'p-2', code: '11112222' });

        flow.start();
        await settle();
        await advance(5000);
        flow.restart();
        await settle();
        release();
        await settle();

        expect(deps.applySession).toHaveBeenCalledTimes(1);
        expect(flow.getState().phase).toBe('done');
    });

    it("a replaced code's late answer does not let two claims for the new code overlap", async () => {
        const { flow, deps, settle, advance } = setup();
        let releaseOld: () => void = () => undefined;
        let inFlight = 0;
        let maxInFlight = 0;
        deps.claim.mockImplementation((id: string) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return new Promise(resolve => {
                const done = () => {
                    inFlight--;
                    resolve({ status: 'pending' });
                };
                if (id === 'p-1') releaseOld = done;
            });
        });
        deps.request.mockResolvedValueOnce(CODE).mockResolvedValueOnce({ ...CODE, pairingId: 'p-2' });

        flow.start();
        await settle();
        await advance(5000);
        flow.restart();
        await settle();
        await advance(5000);
        releaseOld();
        await settle();
        flow.stop();
        flow.start();
        await advance(5000);

        expect(deps.claim.mock.calls.filter(([id]) => id === 'p-2')).toHaveLength(1);
    });
});
