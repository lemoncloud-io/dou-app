import { bridgeProvider, webClient } from '../provider';
import { activateBridgeSimulationEnvironment, createBridgeSimulationEnvironment } from './BridgeSimulationEnvironment';
describe('BridgeSimulationEnvironment', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        bridgeProvider.restoreDefaults();
        jest.clearAllTimers();
        jest.useRealTimers();
    });
    it('should run a typed in-memory request through the app host', async () => {
        const env = createBridgeSimulationEnvironment({
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
        const env = createBridgeSimulationEnvironment({
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
        const env = createBridgeSimulationEnvironment({
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
    it('should activate the bridge simulation through the shared provider proxy', async () => {
        const env = activateBridgeSimulationEnvironment({
            handlers: {
                Ping: async message => ({
                    type: 'Pong',
                    success: true,
                    data: { payload: `provider:${message.data.payload}` },
                }),
            },
        });

        await expect(webClient.request({ type: 'Ping', data: { payload: 'active' } })).resolves.toEqual(
            expect.objectContaining({
                type: 'Pong',
                data: { payload: 'provider:active' },
            })
        );

        env.restore();
    });
});
