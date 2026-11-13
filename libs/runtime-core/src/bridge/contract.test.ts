import {
    CONNECTION_CALL_METHODS,
    CONNECTION_LOCAL_MEMBERS,
    CONNECTION_STREAMS,
    CONNECTION_TARGET,
    SESSION_COMMANDS_TARGET,
    SESSION_COMMAND_METHODS,
    SYNC_CALL_METHODS,
    SYNC_STREAMS,
    SYNC_TARGET,
    answerRuntimeHello,
    chooseRuntimeContract,
    readRuntimeOffer,
    settleRuntimeHello,
} from './contract';
import { createCoreSessionCommands } from '../session/commands';
import { createCoreRuntimeConnection } from '../connection/runtimeConnection';
import { createCoreRuntimeSync } from '../sync/runtimeSync';
import type { RuntimeHelloHost } from './contract';
import { emptySessionSnapshot } from '../testing/sessionView';

const snapshot = emptySessionSnapshot();

describe('chooseRuntimeContract', () => {
    it('takes the newest version both sides speak', () => {
        expect(chooseRuntimeContract([1, 2, 3], [2, 3, 4])).toBe(3);
    });

    it('is null when they share none', () => {
        expect(chooseRuntimeContract([1], [2])).toBeNull();
    });
});

describe('readRuntimeOffer', () => {
    it('reads an offer in one of the contracts it speaks', () => {
        expect(readRuntimeOffer({ sessionOwner: 'native', contracts: [1, 2] }, [2])).toEqual({
            sessionOwner: 'native',
            contracts: [1, 2],
        });
    });

    it.each([
        ['nothing injected', undefined],
        ['null', null],
        ['a string', 'native'],
        ['another owner', { sessionOwner: 'web', contracts: [1] }],
        ['no contracts', { sessionOwner: 'native' }],
        ['contracts that are not versions', { sessionOwner: 'native', contracts: ['1'] }],
        ['a zero version', { sessionOwner: 'native', contracts: [0] }],
    ])('is null for %s', (_label, value) => {
        expect(readRuntimeOffer(value, [1])).toBeNull();
    });

    it('is null for an offer in none of its contracts — not worth a handshake', () => {
        expect(readRuntimeOffer({ sessionOwner: 'native', contracts: [9] }, [1])).toBeNull();
    });

    it('is null for an injected value whose getter throws, instead of failing the boot', () => {
        const hostile = Object.defineProperty({}, 'sessionOwner', {
            get: () => {
                throw new Error('nope');
            },
        });

        expect(readRuntimeOffer(hostile, [1])).toBeNull();
    });

    it('copies the contracts, so a later change to the injected value does not reach it', () => {
        const injected = { sessionOwner: 'native', contracts: [1] };
        const offer = readRuntimeOffer(injected, [1]);
        injected.contracts.push(2);

        expect(offer?.contracts).toEqual([1]);
    });
});

describe('answerRuntimeHello', () => {
    const host = (overrides: Partial<RuntimeHelloHost> = {}): RuntimeHelloHost => ({
        contracts: [1, 2],
        owns: true,
        session: jest.fn(() => ({ seq: 7, session: snapshot })),
        ...overrides,
    });

    it('takes the session under the newest shared contract, with the session as it is now', () => {
        expect(answerRuntimeHello({ contracts: [1, 2, 3] }, host())).toEqual({
            sessionOwner: 'native',
            contract: 2,
            seq: 7,
            session: snapshot,
        });
    });

    it('leaves the session with the page when it does not run its runtime this launch', () => {
        const declining = host({ owns: false });

        expect(answerRuntimeHello({ contracts: [1] }, declining)).toEqual({ sessionOwner: 'web' });
        expect(declining.session).not.toHaveBeenCalled();
    });

    it('leaves the session with the page when they share no contract', () => {
        expect(answerRuntimeHello({ contracts: [3] }, host())).toEqual({ sessionOwner: 'web' });
    });

    it('leaves the session with the page for a hello that names no contracts', () => {
        expect(answerRuntimeHello({} as never, host())).toEqual({ sessionOwner: 'web' });
    });
});

describe('settleRuntimeHello', () => {
    const taken = { sessionOwner: 'native' as const, contract: 1, seq: 3, session: { userId: 'u1' } };
    const answered = (answer: unknown) => ({ answer: answer as never });

    it('mirrors the shell for a complete answer under one of its contracts', () => {
        expect(settleRuntimeHello(answered(taken), [1])).toEqual(taken);
    });

    it('mirrors the shell for a null session — a shell with nobody signed in still owns the session', () => {
        expect(settleRuntimeHello(answered({ ...taken, session: null }), [1])).toEqual({ ...taken, session: null });
    });

    it('runs its own runtime when the shell declines', () => {
        expect(settleRuntimeHello(answered({ sessionOwner: 'web' }), [1])).toEqual({ sessionOwner: 'web' });
    });

    it('runs its own runtime when the shell has no hello handler (NOT_FOUND) — it has no runtime to own the session', () => {
        expect(settleRuntimeHello({ failure: { code: 'NOT_FOUND' } }, [1])).toEqual({ sessionOwner: 'web' });
    });

    // The shell may already own the session when its answer is lost; a page that booted its own then
    // would be a second owner.
    it.each([
        ['a timeout', { failure: { code: 'TIMEOUT' } }],
        ['another bridge failure', { failure: { code: 'INTERNAL_ERROR' } }],
        ['no answer', answered(undefined)],
        ['an answer naming no owner', answered({})],
        ['a contract it never offered', answered({ ...taken, contract: 2 })],
        ['no contract', answered({ ...taken, contract: undefined })],
        ['no sequence number', answered({ ...taken, seq: undefined })],
        ['a fractional sequence number', answered({ ...taken, seq: 1.5 })],
        ['no session', answered({ ...taken, session: undefined })],
    ])('settles nothing for %s, so the page asks again', (_label, outcome) => {
        expect(settleRuntimeHello(outcome as never, [1])).toEqual({ sessionOwner: null });
    });
});

describe('the session commands a runtime call may name', () => {
    it('are every command the core engine runs, each once, under the session target', () => {
        expect([...SESSION_COMMAND_METHODS].sort()).toEqual(Object.keys(createCoreSessionCommands()).sort());
        expect(new Set(SESSION_COMMAND_METHODS).size).toBe(SESSION_COMMAND_METHODS.length);
        expect(SESSION_COMMANDS_TARGET).toBe('session');
    });
});

describe('the sockets and the sync engine across the bridge', () => {
    it("list every member of the core engine's connection once — calls, streams, local ones, the view's two", () => {
        const listed = [
            ...CONNECTION_CALL_METHODS,
            ...CONNECTION_STREAMS,
            ...CONNECTION_LOCAL_MEMBERS,
            'snapshot',
            'subscribe',
        ];

        expect([...listed].sort()).toEqual(Object.keys(createCoreRuntimeConnection()).sort());
        expect(new Set(listed).size).toBe(listed.length);
        expect(CONNECTION_STREAMS).toEqual(['onServerEvent', 'observeRequests']);
        // What crosses is a domain result: a raw request and every frame stay in the runtime's process.
        expect(CONNECTION_LOCAL_MEMBERS).toEqual(['requestOnSlot', 'onServerMessage']);
        expect(CONNECTION_TARGET).toBe('connection');
    });

    it("list every member of the core engine's sync once — a registration is a stream", () => {
        expect([...SYNC_CALL_METHODS, ...SYNC_STREAMS].sort()).toEqual(Object.keys(createCoreRuntimeSync()).sort());
        expect(SYNC_STREAMS).toEqual(['registerTarget']);
        expect(SYNC_TARGET).toBe('sync');
    });
});
