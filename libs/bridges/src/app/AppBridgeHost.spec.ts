import { AppBridgeHost } from './AppBridgeHost';
import { JsonProtocol } from '../common';
import { BRIDGE_PROTOCOL_VERSION } from '../version';

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
            version: BRIDGE_PROTOCOL_VERSION,
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
        expect(secondCallMsg.type).toBe('OnWebAppReady');
        expect(secondCallMsg.refId).toBe('123');
        expect(secondCallMsg.success).toBe(true);
        expect(secondCallMsg.data).toEqual(
            expect.objectContaining({
                appVersion: BRIDGE_PROTOCOL_VERSION,
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                supportedWebMessages: expect.arrayContaining(['WebAppReady', 'Ping']),
                supportedAppMessages: expect.arrayContaining(['OnWebAppReady', 'Pong']),
                capabilities: expect.objectContaining({ typedResponses: true }),
            })
        );
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
            version: BRIDGE_PROTOCOL_VERSION,
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
                version: BRIDGE_PROTOCOL_VERSION,
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

    it('should respond to unknown request types with traceable NOT_FOUND errors', async () => {
        const host = new AppBridgeHost({
            sendToWeb: mockSendToWeb,
            protocol: JsonProtocol,
            version: '3.1.0',
        });

        await host.handleMessage(
            JsonProtocol.encode({
                type: 'UnknownMessage',
                refId: 'missing-ref',
                version: '9.9.9',
                data: {},
            } as any) as string
        );

        expect(mockSendToWeb).toHaveBeenCalledTimes(1);
        const response = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;

        expect(response).toEqual(
            expect.objectContaining({
                type: 'ERROR',
                refId: 'missing-ref',
                version: '9.9.9',
                success: false,
                error: expect.objectContaining({
                    code: 'NOT_FOUND',
                    requestType: 'UnknownMessage',
                    protocolVersion: '9.9.9',
                    appVersion: '3.1.0',
                    traceId: expect.any(String),
                    recoverable: true,
                }),
            })
        );
    });

    it('should wrap thrown handler errors with INTERNAL_ERROR metadata', async () => {
        const host = new AppBridgeHost({
            sendToWeb: mockSendToWeb,
            protocol: JsonProtocol,
            version: '3.1.0',
        });

        host.registerHandler('Ping' as any, async () => {
            throw new Error('boom');
        });

        await host.handleMessage(
            JsonProtocol.encode({
                type: 'Ping',
                refId: 'throw-ref',
                version: '9.9.9',
                data: { payload: 'hello' },
            } as any) as string
        );

        expect(mockSendToWeb).toHaveBeenCalledTimes(1);
        const response = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;

        expect(response).toEqual(
            expect.objectContaining({
                type: 'ERROR',
                refId: 'throw-ref',
                success: false,
                error: expect.objectContaining({
                    code: 'INTERNAL_ERROR',
                    message: 'boom',
                    requestType: 'Ping',
                    expectedResponseType: 'Pong',
                    protocolVersion: '9.9.9',
                    appVersion: '3.1.0',
                    traceId: expect.any(String),
                    recoverable: false,
                }),
            })
        );
    });
});
