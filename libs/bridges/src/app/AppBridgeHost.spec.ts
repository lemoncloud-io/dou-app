import { AppBridgeHost } from './AppBridgeHost';
import { JsonProtocol } from '../common';

describe('AppBridgeHost Buffering & Event Flushing', () => {
    let mockSendToWeb: jest.Mock;

    beforeEach(() => {
        mockSendToWeb = jest.fn();
    });

    it('should buffer pushed events when web is not ready and flush them upon WebAppReady request', async () => {
        const host = new AppBridgeHost({
            sendToWeb: mockSendToWeb,
            protocol: JsonProtocol,
        });

        // 1. Web is not ready yet, so pushEvent should only buffer
        host.pushEvent({ type: 'OnBackPressed', data: {} } as any);
        expect(mockSendToWeb).not.toHaveBeenCalled();

        // 2. Web signals that it is ready
        const webAppReadyRequest = JsonProtocol.encode({
            type: 'WebAppReady',
            refId: '123',
            version: '2.0.0',
            data: {},
        } as any);

        await host.handleMessage(webAppReadyRequest as string);

        // 3. The buffered events and the WebAppReady response should both be flushed
        // The buffer flush should happen first, then the WebAppReady response.
        expect(mockSendToWeb).toHaveBeenCalledTimes(2);

        // First call: Pushed event
        const firstCallMsg = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(firstCallMsg.type).toBe('OnBackPressed');

        // Second call: WebAppReady response
        const secondCallMsg = JsonProtocol.decode(mockSendToWeb.mock.calls[1][0]) as any;
        expect(secondCallMsg.type).toBe('WebAppReady');
        expect(secondCallMsg.refId).toBe('123');
        expect(secondCallMsg.success).toBe(true);
    });

    it('should flush buffered events upon receiving ANY message from web if WebAppReady was not explicitly sent', async () => {
        const host = new AppBridgeHost({
            sendToWeb: mockSendToWeb,
            protocol: JsonProtocol,
        });

        // Register a mock request handler
        host.registerHandler('Ping' as any, async msg => {
            return {
                type: 'Ping',
                success: true,
                data: { pong: msg.data?.payload },
            } as any;
        });

        // Push event while not ready
        host.pushEvent({ type: 'OnBackPressed', data: {} } as any);
        expect(mockSendToWeb).not.toHaveBeenCalled();

        // Web sends a Ping request
        const pingRequest = JsonProtocol.encode({
            type: 'Ping',
            refId: 'ping-id',
            version: '2.0.0',
            data: { payload: 'hello' },
        } as any);

        await host.handleMessage(pingRequest as string);

        // Should flush the buffered event first, then the Ping response
        expect(mockSendToWeb).toHaveBeenCalledTimes(2);

        const firstCall = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(firstCall.type).toBe('OnBackPressed');

        const secondCall = JsonProtocol.decode(mockSendToWeb.mock.calls[1][0]) as any;
        expect(secondCall.type).toBe('Ping');
        expect(secondCall.refId).toBe('ping-id');
        expect(secondCall.data.pong).toBe('hello');
    });

    it('should dispatch immediately when web is already ready', async () => {
        const host = new AppBridgeHost({
            sendToWeb: mockSendToWeb,
            protocol: JsonProtocol,
        });

        // Make web ready by sending a dummy message
        await host.handleMessage(
            JsonProtocol.encode({
                type: 'WebAppReady',
                refId: 'ready-ref',
                version: '2.0.0',
                data: {},
            } as any) as string
        );

        mockSendToWeb.mockClear();

        // Push event - should go out immediately
        host.pushEvent({ type: 'OnBackPressed', data: {} } as any);

        expect(mockSendToWeb).toHaveBeenCalledTimes(1);
        const msg = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(msg.type).toBe('OnBackPressed');
    });
});
