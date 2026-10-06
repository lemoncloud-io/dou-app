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
        client.post({ type: 'Ping', data: { payload: 'hello' } });
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
        const requestPromise = client.request({ type: 'Ping', data: { payload: 'test' } });
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
        const requestPromise = client.request({ type: 'Ping', data: { payload: 'test' } });
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
    it('should reject buffered requests when the native bridge never becomes available', async () => {
        const client = new WebBridgeClient({
            adapter: mockAdapter,
            bridgeReadyTimeoutMs: 1000,
        });
        const requestPromise = client.request({ type: 'Ping', data: { payload: 'test' } });
        jest.advanceTimersByTime(1000);
        await expect(requestPromise).rejects.toEqual(
            expect.objectContaining({
                code: 'NATIVE_NOT_SUPPORTED',
                requestType: 'Ping',
                recoverable: true,
            })
        );
        expect(mockAdapter.postMessage).not.toHaveBeenCalled();
    });
    it('should dispatch immediately without buffering if bridge is already available at construction', () => {
        // Pre-configure bridge
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };
        const client = new WebBridgeClient({ adapter: mockAdapter });
        client.post({ type: 'Ping', data: { payload: 'instant' } });
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
    it('should send object-style OAuthLogin with provider inside data for app compatibility', () => {
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };
        const client = new WebBridgeClient({ adapter: mockAdapter });
        client.post({ type: 'OAuthLogin', data: { provider: 'google' } });
        expect(mockAdapter.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'OAuthLogin',
                data: { provider: 'google' },
                refId: expect.any(String),
            })
        );
        expect(mockAdapter.postMessage.mock.calls[0][0]).not.toHaveProperty('provider');
    });
    it('should preserve object-style metadata beside data payload', () => {
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };
        const client = new WebBridgeClient({ adapter: mockAdapter });
        client.post({ type: 'FetchAppLogBuffer', nonce: 'log-nonce', data: { count: 50 } });
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
        const requestPromise = client.request({ type: 'Ping', data: { payload: 'test' } });
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
    it('should reject WebAppReady echo responses as response type mismatches', async () => {
        (global as any).window.ReactNativeWebView = {
            postMessage: jest.fn(),
        };
        const client = new WebBridgeClient({ adapter: mockAdapter });
        const requestPromise = client.request({ type: 'WebAppReady', data: {} });
        const sentRequest = mockAdapter.postMessage.mock.calls[0][0] as any;
        const onMessageCallback = mockAdapter.onMessage.mock.calls[0][0];
        onMessageCallback({
            type: 'WebAppReady',
            refId: sentRequest.refId,
            version: '1.0.0',
            success: true,
            data: {},
        } as any);
        await expect(requestPromise).rejects.toEqual(
            expect.objectContaining({
                code: 'RESPONSE_TYPE_MISMATCH',
                requestType: 'WebAppReady',
                expectedResponseType: 'OnWebAppReady',
                actualResponseType: 'WebAppReady',
                recoverable: true,
            })
        );
    });

    describe('WebBridgeClient Environment Simulation', () => {
        let mockSimAdapter: jest.Mocked<BridgeAdapter>;

        beforeEach(() => {
            jest.useFakeTimers();
            mockSimAdapter = {
                postMessage: jest.fn(),
                onMessage: jest.fn(),
            } as any;
            (global as any).window.ReactNativeWebView = {
                postMessage: jest.fn(),
            };
        });

        afterEach(() => {
            if (typeof window !== 'undefined') {
                delete (window as any).ReactNativeWebView;
            }
            jest.useRealTimers();
        });

        it('should apply RTT delay to requests and responses', async () => {
            const client = new WebBridgeClient({ adapter: mockSimAdapter });
            client.configureEnvironment({ rttDelayMs: 100 });

            const requestPromise = client.request({ type: 'Ping', data: { payload: 'delayed' } });

            // At 0ms, postMessage has not been called yet (half RTT delay = 50ms)
            expect(mockSimAdapter.postMessage).not.toHaveBeenCalled();

            await jest.advanceTimersByTimeAsync(50);
            expect(mockSimAdapter.postMessage).toHaveBeenCalledTimes(1);

            const sentRequest = mockSimAdapter.postMessage.mock.calls[0][0] as any;
            const onMessageCallback = mockSimAdapter.onMessage.mock.calls[0][0];

            // Receive response instantly on mockSimAdapter
            onMessageCallback({
                type: 'Pong',
                refId: sentRequest.refId,
                success: true,
                data: { payload: 'delayed' },
            } as any);

            // Client shouldn't resolve yet because of incoming delay (half RTT delay = 50ms)
            let resolved = false;
            void requestPromise.then(() => {
                resolved = true;
            });

            await jest.advanceTimersByTimeAsync(49);
            expect(resolved).toBe(false);

            await jest.advanceTimersByTimeAsync(1);
            expect(resolved).toBe(true);
            await expect(requestPromise).resolves.toEqual(
                expect.objectContaining({
                    type: 'Pong',
                    data: { payload: 'delayed' },
                })
            );
        });

        it('should fail request instantly or with delay when forceFailure is enabled', async () => {
            const client = new WebBridgeClient({ adapter: mockSimAdapter });
            client.configureEnvironment({
                forceFailure: {
                    code: 'FORCED',
                    message: 'forced failure',
                },
                rttDelayMs: 100,
            });

            const requestPromise = client.request({ type: 'Ping', data: { payload: 'blocked' } });

            // Advance 50ms, should not reject yet
            let rejected = false;
            void requestPromise.catch(() => {
                rejected = true;
            });

            await jest.advanceTimersByTimeAsync(50);
            expect(rejected).toBe(false);

            await jest.advanceTimersByTimeAsync(50); // Total 100ms
            await expect(requestPromise).rejects.toEqual(
                expect.objectContaining({
                    code: 'FORCED',
                    message: 'forced failure',
                    requestType: 'Ping',
                })
            );
            expect(mockSimAdapter.postMessage).not.toHaveBeenCalled();
        });

        it('should drop requests randomly or deterministic when dropRate is 1', async () => {
            const client = new WebBridgeClient({ adapter: mockSimAdapter });
            client.configureEnvironment({
                dropRate: 1,
            });

            const requestPromise = client.request({ type: 'Ping', data: { payload: 'dropped' } });
            client.post({ type: 'Ping', data: { payload: 'dropped-post' } });

            await jest.advanceTimersByTimeAsync(100);
            expect(mockSimAdapter.postMessage).not.toHaveBeenCalled();

            // Promise should never resolve
            let resolved = false;
            void requestPromise.then(() => {
                resolved = true;
            });
            await jest.advanceTimersByTimeAsync(10000);
            expect(resolved).toBe(false);
        });

        it('should induce response type mismatch when responseTypeMismatch is configured', async () => {
            const client = new WebBridgeClient({ adapter: mockSimAdapter });
            client.configureEnvironment({
                responseTypeMismatch: 'OnFetchSafeArea',
            });

            const requestPromise = client.request({ type: 'Ping', data: { payload: 'mismatch' } });
            const sentRequest = mockSimAdapter.postMessage.mock.calls[0][0] as any;
            const onMessageCallback = mockSimAdapter.onMessage.mock.calls[0][0];

            onMessageCallback({
                type: 'Pong',
                refId: sentRequest.refId,
                success: true,
                data: { payload: 'mismatch' },
            } as any);

            await expect(requestPromise).rejects.toEqual(
                expect.objectContaining({
                    code: 'RESPONSE_TYPE_MISMATCH',
                    actualResponseType: 'OnFetchSafeArea',
                })
            );
        });

        it('should induce malformed response when malformedResponse is true', async () => {
            const client = new WebBridgeClient({ adapter: mockSimAdapter });
            client.configureEnvironment({
                malformedResponse: true,
            });

            const requestPromise = client.request({ type: 'Ping', data: { payload: 'malformed' } });
            const sentRequest = mockSimAdapter.postMessage.mock.calls[0][0] as any;
            const onMessageCallback = mockSimAdapter.onMessage.mock.calls[0][0];

            onMessageCallback({
                type: 'Pong',
                refId: sentRequest.refId,
                success: true,
                data: { payload: 'malformed' },
            } as any);

            await expect(requestPromise).rejects.toEqual(
                expect.objectContaining({
                    code: 'RESPONSE_TYPE_MISMATCH',
                    actualResponseType: 'ERROR',
                })
            );
        });

        it('should clean up timers, unsubscribe from adapter, and reject pending requests on destroy', async () => {
            const unsubscribeSpy = jest.fn();
            mockSimAdapter.onMessage.mockReturnValue(unsubscribeSpy);

            const client = new WebBridgeClient({ adapter: mockSimAdapter });
            const requestPromise = client.request({ type: 'Ping', data: { payload: 'destroy-test' } });

            expect(mockSimAdapter.onMessage).toHaveBeenCalled();

            client.destroy();

            expect(unsubscribeSpy).toHaveBeenCalled();
            await expect(requestPromise).rejects.toEqual(
                expect.objectContaining({
                    code: 'DESTROYED',
                    requestType: 'Ping',
                })
            );
        });

        it('should allow dynamically swapping the adapter and direct messages to the new adapter', () => {
            const client = new WebBridgeClient({ adapter: mockSimAdapter });

            const newAdapter = {
                postMessage: jest.fn(),
                onMessage: jest.fn(),
            } as any;

            client.post({ type: 'Ping', data: { payload: 'before-swap' } });
            expect(mockSimAdapter.postMessage).toHaveBeenCalledTimes(1);
            expect(newAdapter.postMessage).not.toHaveBeenCalled();

            client.setAdapter(newAdapter);

            client.post({ type: 'Ping', data: { payload: 'after-swap' } });
            expect(mockSimAdapter.postMessage).toHaveBeenCalledTimes(1);
            expect(newAdapter.postMessage).toHaveBeenCalledTimes(1);
        });
    });
});

describe('WebBridgeClient request observer', () => {
    let clock: number;
    let mockAdapter: jest.Mocked<BridgeAdapter>;
    let reply: (message: ResponseMessage, length?: number) => void;

    const sentRefIds = () => mockAdapter.postMessage.mock.calls.map(call => (call[0] as { refId: string }).refId);

    const createClient = (options: { timeoutMs?: number } = {}) => {
        const client = new WebBridgeClient({ adapter: mockAdapter, now: () => clock, ...options });
        const onMessage = mockAdapter.onMessage.mock.calls[0][0];
        reply = (message, length) => onMessage(message, length === undefined ? undefined : { length });
        return client;
    };

    beforeEach(() => {
        jest.useFakeTimers();
        clock = 1000;
        mockAdapter = {
            postMessage: jest.fn().mockReturnValue(42),
            onMessage: jest.fn(),
        } as any;
        (window as any).ReactNativeWebView = { postMessage: jest.fn() };
    });

    afterEach(() => {
        delete (window as any).ReactNativeWebView;
        jest.useRealTimers();
    });

    it('reports a resolved request with its round trip and both payload lengths', async () => {
        const client = createClient();
        const observer = jest.fn();
        client.setRequestObserver(observer);

        const promise = client.request({ type: 'Ping', data: { payload: 'x' } });
        clock += 30;
        reply({ type: 'Pong' as any, refId: sentRefIds()[0], success: true, data: {} }, 512);
        await promise;

        expect(observer).toHaveBeenCalledWith({
            type: 'Ping',
            outcome: 'ok',
            queuedMs: 0,
            roundTripMs: 30,
            requestLength: 42,
            responseLength: 512,
            inFlightAtDispatch: 0,
        });
    });

    it('separates the time a request waited for the channel from its round trip', async () => {
        delete (window as any).ReactNativeWebView;
        const client = createClient();
        const observer = jest.fn();
        client.setRequestObserver(observer);

        const promise = client.request({ type: 'Ping', data: { payload: 'x' } });
        clock += 200;
        (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        jest.advanceTimersByTime(50);
        clock += 10;
        reply({ type: 'Pong' as any, refId: sentRefIds()[0], success: true, data: {} });
        await promise;

        expect(observer).toHaveBeenCalledWith(expect.objectContaining({ queuedMs: 200, roundTripMs: 10 }));
    });

    it('counts the requests already waiting for a reply when one leaves', async () => {
        const client = createClient();
        const observer = jest.fn();
        client.setRequestObserver(observer);

        const first = client.request({ type: 'Ping', data: { payload: '1' } });
        const second = client.request({ type: 'Ping', data: { payload: '2' } });
        const [firstRef, secondRef] = sentRefIds();
        reply({ type: 'Pong' as any, refId: firstRef, success: true, data: {} });
        reply({ type: 'Pong' as any, refId: secondRef, success: true, data: {} });
        await Promise.all([first, second]);

        expect(observer.mock.calls.map(call => call[0].inFlightAtDispatch)).toEqual([0, 1]);
    });

    it('reports a timeout without a response length', async () => {
        const client = createClient({ timeoutMs: 1000 });
        const observer = jest.fn();
        client.setRequestObserver(observer);

        const promise = client.request({ type: 'Ping', data: { payload: 'x' } });
        clock += 1000;
        jest.advanceTimersByTime(1000);

        await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
        expect(observer).toHaveBeenCalledWith(
            expect.objectContaining({ outcome: 'TIMEOUT', roundTripMs: 1000, responseLength: undefined })
        );
    });

    it('reports the host error code and a response type mismatch as outcomes', async () => {
        const client = createClient();
        const observer = jest.fn();
        client.setRequestObserver(observer);

        const failed = client.request({ type: 'Ping', data: { payload: '1' } });
        const mismatched = client.request({ type: 'Ping', data: { payload: '2' } });
        const [failedRef, mismatchedRef] = sentRefIds();
        reply({
            type: 'Pong' as any,
            refId: failedRef,
            success: false,
            error: { code: 'NOT_FOUND', message: 'no handler' },
        } as any);
        reply({ type: 'OnSomethingElse' as any, refId: mismatchedRef, success: true, data: {} });

        await expect(failed).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(mismatched).rejects.toMatchObject({ code: 'RESPONSE_TYPE_MISMATCH' });
        expect(observer.mock.calls.map(call => call[0].outcome)).toEqual(['NOT_FOUND', 'RESPONSE_TYPE_MISMATCH']);
    });

    it('measures nothing for a request that left before an observer was attached', async () => {
        const client = createClient();
        const promise = client.request({ type: 'Ping', data: { payload: 'x' } });
        const observer = jest.fn();
        client.setRequestObserver(observer);

        reply({ type: 'Pong' as any, refId: sentRefIds()[0], success: true, data: {} });
        await promise;

        expect(observer).not.toHaveBeenCalled();
    });

    it('leaves the queue time out for a request called before the observer was attached', async () => {
        delete (window as any).ReactNativeWebView;
        const client = createClient();
        const promise = client.request({ type: 'Ping', data: { payload: 'x' } });
        const observer = jest.fn();
        client.setRequestObserver(observer);

        (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        jest.advanceTimersByTime(50);
        reply({ type: 'Pong' as any, refId: sentRefIds()[0], success: true, data: {} });
        await promise;

        expect(observer).toHaveBeenCalledWith(expect.objectContaining({ queuedMs: undefined }));
    });

    it('does not count a simulated outbound delay as queue time', async () => {
        const client = createClient();
        client.configureEnvironment({ rttDelayMs: 400 });
        const observer = jest.fn();
        client.setRequestObserver(observer);

        const promise = client.request({ type: 'Ping', data: { payload: 'x' } });
        clock += 200;
        jest.advanceTimersByTime(200);
        reply({ type: 'Pong' as any, refId: sentRefIds()[0], success: true, data: {} });
        jest.advanceTimersByTime(200);
        await promise;

        expect(observer).toHaveBeenCalledWith(expect.objectContaining({ queuedMs: 0 }));
    });

    it('stops reporting once the observer is removed', async () => {
        const client = createClient();
        const observer = jest.fn();
        client.setRequestObserver(observer);
        client.setRequestObserver(undefined);

        const promise = client.request({ type: 'Ping', data: { payload: 'x' } });
        reply({ type: 'Pong' as any, refId: sentRefIds()[0], success: true, data: {} });
        await promise;

        expect(observer).not.toHaveBeenCalled();
    });

    it('still resolves the caller when the observer throws', async () => {
        const client = createClient();
        client.setRequestObserver(() => {
            throw new Error('observer broke');
        });

        const promise = client.request({ type: 'Ping', data: { payload: 'x' } });
        const response = { type: 'Pong' as any, refId: sentRefIds()[0], success: true, data: {} };
        reply(response);

        await expect(promise).resolves.toEqual(response);
    });
});
