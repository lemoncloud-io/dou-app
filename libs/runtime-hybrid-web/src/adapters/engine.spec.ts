import { defineRuntime, startRuntime } from '@chatic/runtime-client';
import type { RuntimeEngine, RuntimeMirrorPort, RuntimePorts } from '@chatic/runtime-core';

import type { WebHostFacts } from '../hostFacts';
import type { SessionOwnerChoice, SessionOwnerOptions } from '../settleSessionOwner';

const mockMirror = { id: 'mirror' } as unknown as RuntimeEngine;
const mockCreateBridgedRuntime = jest.fn((_options: unknown) => mockMirror);
jest.mock('../createBridgedRuntime', () => ({
    createBridgedRuntime: (options: unknown) => mockCreateBridgedRuntime(options),
}));

import { engineMirror } from './engine';

const facts = { runtimeOffer: { contracts: [1] } } as unknown as WebHostFacts;
const port = {} as RuntimeMirrorPort;
const hello = { seq: 3, session: {} as never };
const native: SessionOwnerChoice = { sessionOwner: 'native', contract: 1, hello, port };
const core = { id: 'core' } as unknown as RuntimeEngine;

const settled = (choice: SessionOwnerChoice) => jest.fn(async (_options: SessionOwnerOptions) => choice);

beforeEach(() => mockCreateBridgedRuntime.mockClear());

describe('engine.mirror', () => {
    it("asks with the offer from the facts and the page's own switch", async () => {
        const settle = settled({ sessionOwner: 'web' });
        await engineMirror({ settle, disabled: true }).create({ facts, core: async () => core });

        expect(settle).toHaveBeenCalledWith({ disabled: true, offer: facts.runtimeOffer });
    });

    it("mirrors the shell when it takes the session, building none of the page's ports", async () => {
        const buildCore = jest.fn(async () => core);
        const outcome = await engineMirror({ settle: settled(native) }).create({ facts, core: buildCore });

        expect(mockCreateBridgedRuntime).toHaveBeenCalledWith({ hello, port });
        expect(buildCore).not.toHaveBeenCalled();
        expect(outcome).toEqual({ engine: mockMirror, owner: native });
    });

    it('runs the core over the declared ports when the page owns the session, saying so to storage', async () => {
        const buildCore = jest.fn(async () => core);
        const outcome = await engineMirror({ settle: settled({ sessionOwner: 'web' }) }).create({
            facts,
            core: buildCore,
        });

        expect(buildCore).toHaveBeenCalledWith({ sessionOwner: 'web' });
        expect(mockCreateBridgedRuntime).not.toHaveBeenCalled();
        expect(outcome).toEqual({ engine: core, owner: { sessionOwner: 'web' } });
    });

    it('boots no engine when who owns the session could not be settled', async () => {
        const unsettled: SessionOwnerChoice = { sessionOwner: null, attempts: 4, lastFailure: 'TIMEOUT' };
        const buildCore = jest.fn(async () => core);
        const outcome = await engineMirror({ settle: settled(unsettled) }).create({ facts, core: buildCore });

        expect(buildCore).not.toHaveBeenCalled();
        expect(mockCreateBridgedRuntime).not.toHaveBeenCalled();
        expect(outcome).toEqual({ engine: null, owner: unsettled });
    });

    it('is named engine.mirror and runs on any page', () => {
        const adapter = engineMirror();
        expect([adapter.port, adapter.id]).toEqual(['engine', 'engine.mirror']);
        expect(adapter.supports).toBeUndefined();
    });
});

describe('engine.mirror through startRuntime', () => {
    const declaration = (choice: SessionOwnerChoice, storageContexts: unknown[]) => {
        const fake = <P extends 'transport' | 'auth' | 'db' | 'foreground'>(p: P) => ({
            default: { id: `${p}.fake` as `${P}.fake`, port: p, create: () => ({}) as RuntimePorts[P] },
        });
        return defineRuntime<WebHostFacts, SessionOwnerChoice>({
            name: 'web',
            facts: () => facts,
            ports: {
                storage: {
                    default: {
                        id: 'storage.fake',
                        port: 'storage',
                        create: context => {
                            storageContexts.push(context);
                            return {} as RuntimePorts['storage'];
                        },
                    },
                },
                transport: fake('transport'),
                auth: fake('auth'),
                db: fake('db'),
                foreground: fake('foreground'),
            },
            engine: { default: engineMirror({ settle: settled(choice) }) },
        });
    };

    const start = (choice: SessionOwnerChoice) => {
        const storageContexts: unknown[] = [];
        const initEngine = jest.fn();
        const createRuntime = jest.fn(() => core);
        const started = startRuntime(declaration(choice, storageContexts), {
            config: { init: jest.fn(), isInitialized: () => true, snapshot: (() => undefined) as never },
            read: () => undefined,
            createRuntime,
            initEngine,
            log: () => undefined,
        });
        return { started, storageContexts, initEngine, createRuntime };
    };

    it('on a launch the shell owns, boots the mirror and builds no storage', async () => {
        const run = start(native);
        const started = await run.started;

        expect(run.storageContexts).toEqual([]);
        expect(run.createRuntime).not.toHaveBeenCalled();
        expect(run.initEngine).toHaveBeenCalledWith(mockMirror);
        expect(started.owner).toBe(native);
        expect(started.engineChoice.id).toBe('engine.mirror');
    });

    it('on a launch the page owns, builds the declared storage told so, and boots the core', async () => {
        const run = start({ sessionOwner: 'web' });
        const started = await run.started;

        expect(run.storageContexts).toEqual([{ facts, sessionOwner: 'web' }]);
        expect(run.initEngine).toHaveBeenCalledWith(core);
        expect(started.owner).toEqual({ sessionOwner: 'web' });
    });

    it('on an unsettled launch, boots nothing and hands the settle back', async () => {
        const unsettled: SessionOwnerChoice = {
            sessionOwner: null,
            attempts: 1,
            lastFailure: 'RUNTIME_CONTRACT_MISMATCH',
        };
        const run = start(unsettled);
        const started = await run.started;

        expect(run.initEngine).not.toHaveBeenCalled();
        expect(started.engine).toBeNull();
        expect(started.owner).toBe(unsettled);
    });
});
