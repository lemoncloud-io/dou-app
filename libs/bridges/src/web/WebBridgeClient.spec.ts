import { WebBridgeClient } from './WebBridgeClient';
import type { BridgeAdapter } from './adapters';
import type { ResponseMessage } from '../common';

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
            type: 'Ping' as any,
            refId,
            success: true,
            data: { pong: 'test' },
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

        await expect(requestPromise).rejects.toEqual({
            code: 'TIMEOUT',
            message: 'Request timed out after 1000ms',
        });
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
});
