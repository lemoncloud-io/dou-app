import { beforeEach, describe, expect, it, vi } from 'vitest';

type MessageHandler = (message: unknown) => void;

const connectionMocks = {
    handlers: [] as MessageHandler[],
    onServerMessage: vi.fn((handler: MessageHandler) => {
        connectionMocks.handlers.push(handler);
        return () => undefined;
    }),
};

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        connection: { onServerMessage: (handler: MessageHandler) => connectionMocks.onServerMessage(handler) },
    })
);

const loadStore = async () => {
    vi.resetModules();
    return import('./useSocketFrameLogStore');
};

beforeEach(() => {
    connectionMocks.handlers = [];
    connectionMocks.onServerMessage.mockClear();
});

describe('startSocketFrameLog', { timeout: 30_000 }, () => {
    it('records each inbound frame, split into domain and action', async () => {
        const { startSocketFrameLog, useSocketFrameLogStore } = await loadStore();

        startSocketFrameLog();
        connectionMocks.handlers[0]({ type: 'chat.feed', data: { chatNo: 7 } });

        expect(useSocketFrameLogStore.getState().frames[0]).toMatchObject({
            domain: 'chat',
            action: 'feed',
            chatNo: 7,
        });
    });

    it('attaches one listener however often it is called', async () => {
        const { startSocketFrameLog } = await loadStore();

        startSocketFrameLog();
        startSocketFrameLog();

        expect(connectionMocks.onServerMessage).toHaveBeenCalledTimes(1);
    });

    it('stays free to start after a call that threw because the engine was not there yet', async () => {
        const { startSocketFrameLog } = await loadStore();
        connectionMocks.onServerMessage.mockImplementationOnce(() => {
            throw new Error('the runtime engine was read before initAppRuntime(engine)');
        });

        expect(() => startSocketFrameLog()).toThrow('initAppRuntime');
        startSocketFrameLog();

        expect(connectionMocks.onServerMessage).toHaveBeenCalledTimes(2);
        expect(connectionMocks.handlers).toHaveLength(1);
    });
});
