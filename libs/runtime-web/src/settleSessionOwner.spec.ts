import type { IWebBridgeClient } from '@chatic/bridges';
import { RUNTIME_CONTRACTS } from '@chatic/runtime-core';

import { SESSION_OWNER_HELLO_TIMEOUT_MS, settleSessionOwner, visibleClock } from './settleSessionOwner';

jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const OFFER = { sessionOwner: 'native', contracts: [...RUNTIME_CONTRACTS] };
const NATIVE = { sessionOwner: 'native', contract: RUNTIME_CONTRACTS[0], seq: 4, session: { uid: 'u1' } };

type Answer = { data: unknown } | { error: unknown };

/** A bridge client that answers each hello with the next scripted answer, and lets the test push. */
const scriptedClient = (...answers: Answer[]) => {
    const handlers = new Map<string, (message: { data: unknown }) => void>();
    const request = jest.fn(async (message: { type: string }, _options?: { timeoutMs?: number }) => {
        const next = answers.shift() ?? { error: { code: 'TIMEOUT' } };
        if ('error' in next) throw next.error;
        return { type: `On${message.type}`, success: true, data: next.data };
    });
    const client = {
        request,
        onEvent: jest.fn((type: string, handler: (message: { data: unknown }) => void) => {
            handlers.set(type, handler);
            return () => handlers.delete(type);
        }),
    };
    const push = (type: string, data: unknown) => handlers.get(type)?.({ data });
    return { client: client as unknown as IWebBridgeClient, request, push };
};

/** A clock the waits move forward, so a run of retries takes no real time. */
const fakeClock = () => {
    let at = 0;
    const waits: number[] = [];
    return {
        now: () => at,
        wait: async (ms: number) => {
            waits.push(ms);
            at += ms;
        },
        waits,
    };
};

describe('settleSessionOwner', () => {
    it('settles on the page without asking when the shell made no offer', async () => {
        const { client, request } = scriptedClient();

        await expect(settleSessionOwner({ offer: undefined, client })).resolves.toEqual({ sessionOwner: 'web' });
        expect(request).not.toHaveBeenCalled();
    });

    it('settles on the page without asking when the offer names none of its contracts', async () => {
        const { client, request } = scriptedClient();

        await expect(
            settleSessionOwner({ offer: { sessionOwner: 'native', contracts: [999] }, client })
        ).resolves.toEqual({ sessionOwner: 'web' });
        expect(request).not.toHaveBeenCalled();
    });

    it("settles on the page without asking when the page's own setting says not to", async () => {
        const { client, request } = scriptedClient();

        await expect(settleSessionOwner({ offer: OFFER, disabled: true, client })).resolves.toEqual({
            sessionOwner: 'web',
        });
        expect(request).not.toHaveBeenCalled();
    });

    it("asks a shell that already holds the session even when the page's own setting says not to", async () => {
        const { client, request } = scriptedClient({ data: NATIVE });

        const choice = await settleSessionOwner({ offer: { ...OFFER, held: true }, disabled: true, client });

        expect(request).toHaveBeenCalledTimes(1);
        expect(choice).toMatchObject({ sessionOwner: 'native', contract: NATIVE.contract });
    });

    it('asks a shell that holds the session under no shared contract, and boots neither when it refuses', async () => {
        const { client, request } = scriptedClient({ error: { code: 'RUNTIME_CONTRACT_MISMATCH' } });

        const choice = await settleSessionOwner({
            offer: { sessionOwner: 'native', contracts: [999], held: true },
            client,
            ...fakeClock(),
        });

        expect(request).toHaveBeenCalledTimes(1);
        expect(choice).toEqual({ sessionOwner: null, attempts: 1, lastFailure: 'RUNTIME_CONTRACT_MISMATCH' });
    });

    it('takes the web answer of a held offer as it would any other', async () => {
        const { client } = scriptedClient({ data: { sessionOwner: 'web' } });

        await expect(
            settleSessionOwner({ offer: { ...OFFER, held: true }, disabled: true, client })
        ).resolves.toEqual({ sessionOwner: 'web' });
    });

    it("says hello with the page's contracts and mirrors the shell when it answers native", async () => {
        const { client, request } = scriptedClient({ data: NATIVE });

        const choice = await settleSessionOwner({ offer: OFFER, client });

        expect(request).toHaveBeenCalledWith(
            { type: 'RuntimeHello', data: { contracts: [...RUNTIME_CONTRACTS] } },
            { timeoutMs: SESSION_OWNER_HELLO_TIMEOUT_MS }
        );
        expect(choice).toMatchObject({
            sessionOwner: 'native',
            contract: NATIVE.contract,
            hello: { seq: 4, session: { uid: 'u1' } },
        });
    });

    it('settles on the page when the shell answers web, or has no hello handler', async () => {
        const web = scriptedClient({ data: { sessionOwner: 'web' } });
        const noHandler = scriptedClient({ error: { code: 'NOT_FOUND' } });

        await expect(settleSessionOwner({ offer: OFFER, client: web.client })).resolves.toEqual({
            sessionOwner: 'web',
        });
        await expect(settleSessionOwner({ offer: OFFER, client: noHandler.client })).resolves.toEqual({
            sessionOwner: 'web',
        });
    });

    it('asks again, with a growing pause, until an answer settles it', async () => {
        const clock = fakeClock();
        const { client, request } = scriptedClient(
            { error: { code: 'TIMEOUT' } },
            { error: { code: 'RUNTIME_STARTING' } },
            { data: { sessionOwner: 'native', contract: 999, seq: 1, session: {} } },
            { data: NATIVE }
        );

        const choice = await settleSessionOwner({ offer: OFFER, client, now: clock.now, wait: clock.wait });

        expect(choice.sessionOwner).toBe('native');
        expect(request).toHaveBeenCalledTimes(4);
        expect(clock.waits).toEqual([250, 500, 1_000]);
    });

    it('gives up, booting neither runtime, once asking has gone on past the limit', async () => {
        const clock = fakeClock();
        const { client, request } = scriptedClient();

        const choice = await settleSessionOwner({
            offer: OFFER,
            client,
            giveUpAfterMs: 5_000,
            now: clock.now,
            wait: clock.wait,
        });

        expect(choice).toEqual({ sessionOwner: null, attempts: 5, lastFailure: 'TIMEOUT' });
        expect(request).toHaveBeenCalledTimes(5);
        // After 250 + 500 + 1000 + 2000 another 2 s pause would pass 5 s, so the fifth ask is the last.
        expect(clock.waits).toEqual([250, 500, 1_000, 2_000]);
        expect(clock.now()).toBeLessThanOrEqual(5_000);
    });

    it('makes the port before the hello, so a session push that lands before the answer is kept', async () => {
        let push: (type: string, data: unknown) => void = () => undefined;
        const scripted = scriptedClient();
        scripted.request.mockImplementationOnce(async () => {
            push('OnRuntimeSessionChanged', { seq: 5, signals: ['session'], session: { uid: 'u2' } });
            return { type: 'OnRuntimeHello', success: true, data: NATIVE };
        });
        push = scripted.push;

        const choice = await settleSessionOwner({ offer: OFFER, client: scripted.client });
        if (choice.sessionOwner !== 'native') throw new Error('expected the shell to own the session');
        const heard: unknown[] = [];
        choice.port.onSessionChanged(payload => heard.push(payload));

        expect(heard).toEqual([{ seq: 5, signals: ['session'], session: { uid: 'u2' } }]);
    });

    it('gives a hello no more than what is left of the limit, so asking stops at the limit', async () => {
        const clock = fakeClock();
        const { client, request } = scriptedClient();
        // Every hello times out, using up the wait it was given.
        request.mockImplementation(async (_message: { type: string }, options?: { timeoutMs?: number }) => {
            await clock.wait(options?.timeoutMs ?? 0);
            throw { code: 'TIMEOUT' };
        });

        const choice = await settleSessionOwner({ offer: OFFER, client, now: clock.now, wait: clock.wait });

        expect(choice).toEqual({ sessionOwner: null, attempts: 3, lastFailure: 'TIMEOUT' });
        expect(request.mock.calls.map(([, options]) => options?.timeoutMs)).toEqual([10_000, 10_000, 9_250]);
        expect(clock.now()).toBe(30_000);
    });

    it('stops at once when the shell holds the session under a contract the page does not speak', async () => {
        const clock = fakeClock();
        const { client, request } = scriptedClient({ error: { code: 'RUNTIME_CONTRACT_MISMATCH' } });

        const choice = await settleSessionOwner({ offer: OFFER, client, now: clock.now, wait: clock.wait });

        expect(choice).toEqual({ sessionOwner: null, attempts: 1, lastFailure: 'RUNTIME_CONTRACT_MISMATCH' });
        expect(request).toHaveBeenCalledTimes(1);
        expect(clock.waits).toEqual([]);
    });
});

describe('visibleClock', () => {
    const setVisibility = (state: 'visible' | 'hidden') => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
        document.dispatchEvent(new Event('visibilitychange'));
    };

    afterEach(() => {
        jest.restoreAllMocks();
        setVisibility('visible');
    });

    it('counts only the time the page is shown', () => {
        let at = 1_000;
        jest.spyOn(Date, 'now').mockImplementation(() => at);
        setVisibility('visible');
        const clock = visibleClock();

        at += 2_000;
        setVisibility('hidden');
        at += 60_000;
        expect(clock()).toBe(2_000);
        setVisibility('visible');
        at += 500;

        expect(clock()).toBe(2_500);
    });
});
