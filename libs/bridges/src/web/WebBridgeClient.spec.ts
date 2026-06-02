import { WebBridgeClient } from './WebBridgeClient';
import type { BridgeAdapter } from './adapters';
import type { ResponseMessage } from '../common';
import { BRIDGE_PROTOCOL_VERSION } from '../version';

describe('WebBridgeClient Buffering & Detection', () => {
    let mockAdapter: jest.Mocked<BridgeAdapter>;

    beforeEach(() => {
        jest.useFakeTimers();

        // Mock adapter
        mockAdapter = {
            postMessage: jest.fn(),
            onMessage: jest.fn(),
        } as any;

        // Clean up window properties
        if (typeof window !== 'undefined') {
            delete (window as any).ReactNativeWebView;
            delete (window as any).ChaticMessageHandler;
            delete (window as any).webkit;
        }
    });

    afterEach(() => {
        if (typeof window !== 'undefined') {
            delete (window as any).ReactNativeWebView;
            delete (window as any).ChaticMessageHandler;
            delete (window as any).webkit;
        }
        jest.useRealTimers();
    });

    it('should buffer post requests and flush them when bridge becomes available via polling', () => {
        const client = new WebBridgeClient({ adapter: mockAdapter });

        // Initially no bridge, so no post message sent
        client.post('Ping' as any, { data: { payload: 'hello' } } as any);
        expect(mockAdapter.postMessage).not.toHaveBeenCalled();

        // Simulate bridge becomes available
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        // Advance timer for polling (50ms interval)
        jest.advanceTimersByTime(50);

        // Buffered message should be flushed now
        expect(mockAdapter.postMessage).toHaveBeenCalledTimes(1);
        expect(mockAdapter.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'Ping',
                data: { payload: 'hello' },
            })
        );
    });

    it('should buffer request promises and resolve them after bridge becomes available and responds', async () => {
        const client = new WebBridgeClient({ adapter: mockAdapter });

        // Simulate a request
        const requestPromise = client.request('Ping' as any, { data: { payload: 'test' } } as any);

        // Initially buffered
        expect(mockAdapter.postMessage).not.toHaveBeenCalled();

        // Simulate bridge becomes available
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        // Advance timers to trigger polling detection
        jest.advanceTimersByTime(50);

        expect(mockAdapter.postMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockAdapter.postMessage.mock.calls[0][0] as any;
        const refId = sentMessage.refId;
        expect(refId).toBeDefined();

        // Capture the handleMessage callback registered on the adapter
        const onMessageCallback = mockAdapter.onMessage.mock.calls[0][0];

        // Simulate native response
        const mockResponse: ResponseMessage = {
            type: 'Pong' as any,
            refId,
            success: true,
            data: { payload: 'test' },
        };

        onMessageCallback(mockResponse);

        const response = await requestPromise;
        expect(response).toEqual(mockResponse);
    });

    it('should start request timeout timer ONLY AFTER the request is actually dispatched to native', async () => {
        const client = new WebBridgeClient({ adapter: mockAdapter, timeoutMs: 1000 });

        const requestPromise = client.request('Ping' as any, { data: { payload: 'test' } } as any);

        // Advance time while buffered - timeout should NOT trigger because it hasn't dispatched
        jest.advanceTimersByTime(2000);

        // Simulate bridge becomes available
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };
        jest.advanceTimersByTime(50);

        expect(mockAdapter.postMessage).toHaveBeenCalledTimes(1);

        // Now that it has dispatched, let's advance time by 1000ms to trigger the timeout
        jest.advanceTimersByTime(1000);

        await expect(requestPromise).rejects.toEqual(
            expect.objectContaining({
                code: 'TIMEOUT',
                message: 'Request timed out after 1000ms',
                requestType: 'Ping',
                expectedResponseType: 'Pong',
            })
        );
    });

    it('should dispatch immediately without buffering if bridge is already available at construction', () => {
        // Pre-configure bridge
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const client = new WebBridgeClient({ adapter: mockAdapter });

        client.post('Ping' as any, { data: { payload: 'instant' } } as any);

        expect(mockAdapter.postMessage).toHaveBeenCalledTimes(1);
    });

    it('should support object-style post and request messages', async () => {
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const client = new WebBridgeClient({ adapter: mockAdapter });

        client.post({ type: 'Ping', data: { payload: 'object-post' } } as any);

        expect(mockAdapter.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'Ping',
                data: { payload: 'object-post' },
                version: BRIDGE_PROTOCOL_VERSION,
                refId: expect.any(String),
            })
        );

        const requestPromise = client.request({ type: 'Ping', data: { payload: 'object-request' } } as any);
        const sentRequest = mockAdapter.postMessage.mock.calls[1][0] as any;
        const onMessageCallback = mockAdapter.onMessage.mock.calls[0][0];

        onMessageCallback({
            type: 'Pong',
            refId: sentRequest.refId,
            success: true,
            data: { payload: 'object-request' },
        } as any);

        await expect(requestPromise).resolves.toEqual(
            expect.objectContaining({
                type: 'Pong',
                data: { payload: 'object-request' },
            })
        );
    });

    it('should normalize legacy overload payload params into data for current web to app compatibility', () => {
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const client = new WebBridgeClient({ adapter: mockAdapter });

        client.post('OAuthLogin' as any, { provider: 'google' } as any);

        expect(mockAdapter.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'OAuthLogin',
                data: { provider: 'google' },
                refId: expect.any(String),
            })
        );
        expect(mockAdapter.postMessage.mock.calls[0][0]).not.toHaveProperty('provider');
    });

    it('should preserve legacy overload metadata while normalizing direct payload params', () => {
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const client = new WebBridgeClient({ adapter: mockAdapter });

        client.post(
            'FetchAppLogBuffer' as any,
            {
                nonce: 'log-nonce',
                count: 50,
            } as any
        );

        expect(mockAdapter.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'FetchAppLogBuffer',
                nonce: 'log-nonce',
                data: { count: 50 },
                refId: expect.any(String),
            })
        );
    });

    it('should reject response type mismatches with traceable protocol metadata', async () => {
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const client = new WebBridgeClient({ adapter: mockAdapter });
        const requestPromise = client.request('Ping' as any, { data: { payload: 'test' } } as any);
        const sentRequest = mockAdapter.postMessage.mock.calls[0][0] as any;
        const onMessageCallback = mockAdapter.onMessage.mock.calls[0][0];

        onMessageCallback({
            type: 'OnFetchSafeArea',
            refId: sentRequest.refId,
            success: true,
            data: { top: 0, bottom: 0, left: 0, right: 0 },
        } as any);

        await expect(requestPromise).rejects.toEqual(
            expect.objectContaining({
                code: 'RESPONSE_TYPE_MISMATCH',
                requestType: 'Ping',
                expectedResponseType: 'Pong',
                actualResponseType: 'OnFetchSafeArea',
                recoverable: true,
            })
        );
    });

    it('should normalize legacy WebAppReady responses for compatibility', async () => {
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const client = new WebBridgeClient({ adapter: mockAdapter });
        const requestPromise = client.request('WebAppReady' as any, { data: {} } as any);
        const sentRequest = mockAdapter.postMessage.mock.calls[0][0] as any;
        const onMessageCallback = mockAdapter.onMessage.mock.calls[0][0];

        onMessageCallback({
            type: 'WebAppReady',
            refId: sentRequest.refId,
            version: '1.0.0',
            success: true,
            data: {},
        } as any);

        await expect(requestPromise).resolves.toEqual(
            expect.objectContaining({
                type: 'OnWebAppReady',
                success: true,
                data: expect.objectContaining({
                    protocolVersion: '1.0.0',
                    capabilities: expect.objectContaining({ legacyWebAppReady: true }),
                }),
            })
        );
    });
});
