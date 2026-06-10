import { createTestBridgeEnvironment } from './TestBridgeEnvironment';
describe('TestBridgeEnvironment', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });
    it('should run a typed in-memory request through the app host', async () => {
        const env = createTestBridgeEnvironment({
            handlers: {
                Ping: async message => ({
                    type: 'Pong',
                    success: true,
                    data: { payload: message.data.payload },
                }),
            },
        });
        const responsePromise = env.webClient.request({ type: 'Ping', data: { payload: 'hello' } });
        await expect(responsePromise).resolves.toEqual(
            expect.objectContaining({
                type: 'Pong',
                success: true,
                data: { payload: 'hello' },
            })
        );
    });
    it('should apply RTT delay across the in-memory bridge', async () => {
        const env = createTestBridgeEnvironment({
            rttDelayMs: 100,
            handlers: {
                Ping: async message => ({
                    type: 'Pong',
                    success: true,
                    data: { payload: message.data.payload },
                }),
            },
        });
        const responsePromise = env.webClient.request({ type: 'Ping', data: { payload: 'delayed' } });
        let resolved = false;
        void responsePromise.then(() => {
            resolved = true;
        });
        await jest.advanceTimersByTimeAsync(50);
        expect(resolved).toBe(false);
        await jest.advanceTimersByTimeAsync(50);
        await expect(responsePromise).resolves.toEqual(
            expect.objectContaining({
                type: 'Pong',
                data: { payload: 'delayed' },
            })
        );
    });
    it('should fail before reaching the app host when forceFailure is enabled', async () => {
        const handler = jest.fn();
        const env = createTestBridgeEnvironment({
            forceFailure: {
                code: 'FORCED',
                message: 'forced failure',
            },
            handlers: {
                Ping: handler,
            },
        });
        const responsePromise = env.webClient.request({ type: 'Ping', data: { payload: 'blocked' } });
        await expect(responsePromise).rejects.toEqual(
            expect.objectContaining({
                code: 'FORCED',
                message: 'forced failure',
                requestType: 'Ping',
            })
        );
        expect(handler).not.toHaveBeenCalled();
    });
});
