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
            })
        );
    });

    // The web deploys ahead of the app, so it cannot assume what the INSTALLED app can store. The
    // handshake is where the app says so — and a host with no local cache DB must keep sending the
    // exact payload it sent before these fields existed.
    it('reports local-cache capability only when the host declares it', async () => {
        const readyRequest = JsonProtocol.encode({
            type: 'WebAppReady',
            refId: '1',
            version: BRIDGE_PROTOCOL_VERSION,
            data: {},
        } as any);

        const silent = new AppBridgeHost({ sendToWeb: mockSendToWeb, protocol: JsonProtocol });
        await silent.handleMessage(readyRequest as string);
        const silentData = (JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any).data;
        expect(silentData).not.toHaveProperty('cacheSchemaVersion');
        expect(silentData).not.toHaveProperty('supportedCacheTypes');

        mockSendToWeb.mockClear();
        const declaring = new AppBridgeHost({
            sendToWeb: mockSendToWeb,
            protocol: JsonProtocol,
            cacheSchemaVersion: 4,
            supportedCacheTypes: ['chat', 'channel'],
        });
        await declaring.handleMessage(readyRequest as string);
        const declaredData = (JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any).data;
        expect(declaredData.cacheSchemaVersion).toBe(4);
        expect(declaredData.supportedCacheTypes).toEqual(['chat', 'channel']);
        expect(declaredData).not.toHaveProperty('cacheDomainVersions');
    });

    // ADR-0053: the app reports the contract version it IMPLEMENTS, measured rather than declared.
    // Measuring can be slow or fail, so the resolver is a thunk the handshake awaits — and the rest
    // of the handshake must survive it failing, since this reply is the web's only chance to learn
    // any of this.
    describe('per-domain cache contract versions', () => {
        const readyRequest = () =>
            JsonProtocol.encode({
                type: 'WebAppReady',
                refId: '1',
                version: BRIDGE_PROTOCOL_VERSION,
                data: {},
            } as any) as string;

        const replyData = () => (JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any).data;

        it('reports the resolved versions and derives supportedCacheTypes from them', async () => {
            const host = new AppBridgeHost({
                sendToWeb: mockSendToWeb,
                protocol: JsonProtocol,
                // The static list still claims `invite`; the measurement says the table is not
                // there. The report must follow the measurement, or the web reads the name alone as
                // contract version 1 and the measurement buys nothing.
                supportedCacheTypes: ['chat', 'invite'],
                resolveCacheDomainVersions: async () => ({ chat: 1 }),
            });

            await host.handleMessage(readyRequest());

            expect(replyData().cacheDomainVersions).toEqual({ chat: 1 });
            expect(replyData().supportedCacheTypes).toEqual(['chat']);
        });

        it('falls back to the static declaration when the resolver rejects', async () => {
            const host = new AppBridgeHost({
                sendToWeb: mockSendToWeb,
                protocol: JsonProtocol,
                cacheSchemaVersion: 11,
                supportedCacheTypes: ['chat', 'invite'],
                resolveCacheDomainVersions: async () => {
                    throw new Error('SQLite unavailable');
                },
            });

            await host.handleMessage(readyRequest());

            // Degrading to exactly the pre-ADR-0053 payload, not to silence.
            expect(replyData()).not.toHaveProperty('cacheDomainVersions');
            expect(replyData().supportedCacheTypes).toEqual(['chat', 'invite']);
            expect(replyData().cacheSchemaVersion).toBe(11);
        });

        it('falls back the same way when the resolver answers undefined (e.g. its own timeout)', async () => {
            const host = new AppBridgeHost({
                sendToWeb: mockSendToWeb,
                protocol: JsonProtocol,
                supportedCacheTypes: ['chat', 'invite'],
                resolveCacheDomainVersions: async () => undefined,
            });

            await host.handleMessage(readyRequest());

            expect(replyData()).not.toHaveProperty('cacheDomainVersions');
            expect(replyData().supportedCacheTypes).toEqual(['chat', 'invite']);
        });
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

    it('SendLog 릴레이는 웹 준비 신호로 취급하지 않아 버퍼를 플러시하지 않는다 (cold start 유실 방지)', async () => {
        const host = new AppBridgeHost({
            sendToWeb: mockSendToWeb,
            protocol: JsonProtocol,
        });

        // The web logger (SendLog) relays from the earliest module-evaluation
        // phase — long before the web app can receive events — so it must not
        // trigger the buffered-event flush. (The legacy __console__ relay is
        // gone; SendLog is the only log channel per ADR-0047.)
        host.registerHandler('SendLog' as any, async () => ({ type: 'OnSendLog', success: true, data: {} }) as any);
        host.registerHandler('Ping' as any, async () => ({ type: 'Ping', success: true, data: {} }) as any);

        // Cold-start OnNavigate sits in the buffer while the web boots.
        host.pushEvent({ type: 'OnNavigate', data: { path: '/channels/1/room' } } as any);

        // An early boot log arrives: it must be answered but must not flush the buffer.
        await host.handleMessage(
            JsonProtocol.encode({
                type: 'SendLog',
                refId: 'log-1',
                version: BRIDGE_PROTOCOL_VERSION,
                data: { level: 'info', tag: 'WEB_CORE', message: 'booting' },
            } as any) as string
        );

        expect(mockSendToWeb).toHaveBeenCalledTimes(1);
        const logResponse = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(logResponse.type).toBe('OnSendLog');

        // A real (non-relay) message marks the web ready: buffered event flushes first.
        await host.handleMessage(
            JsonProtocol.encode({
                type: 'Ping',
                refId: 'ping-1',
                version: BRIDGE_PROTOCOL_VERSION,
                data: {},
            } as any) as string
        );

        expect(mockSendToWeb).toHaveBeenCalledTimes(3);
        const flushed = JsonProtocol.decode(mockSendToWeb.mock.calls[1][0]) as any;
        expect(flushed.type).toBe('OnNavigate');
        expect(flushed.data.path).toBe('/channels/1/room');
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
    it('아무것도 반환하지 않는 핸들러는 응답을 보내지 않는다 (fire-and-forget)', async () => {
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb });
        // `SendLog`가 이 경로입니다. 웹의 로그 전달자는 refId 없이 올려보내므로 응답이 내려가도
        // 매칭될 pending이 없어 폐기되는데, 그 폐기되는 응답 한 건마다 UI 스레드의
        // evaluateJavascript가 한 번 돕니다 — 로그 건수만큼 브릿지 대역을 태우는 순수 낭비였습니다.
        const handler = jest.fn().mockResolvedValue(undefined);
        host.registerHandler('SendLog', handler as any);

        await host.handleMessage(JsonProtocol.encode({ type: 'SendLog', data: { message: 'hi' } }) as string);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(mockSendToWeb).not.toHaveBeenCalled();
    });

    it('반환값이 있는 핸들러는 이전과 동일하게 응답을 보낸다', async () => {
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb });
        host.registerHandler('FetchManyCacheData', (() => ({
            type: 'OnFetchManyCacheData',
            success: true,
            data: { items: [] },
        })) as any);

        await host.handleMessage(
            JsonProtocol.encode({
                type: 'FetchManyCacheData',
                refId: 'ref-1',
                data: { type: 'chat', ids: ['c1'] },
            }) as string
        );

        const response = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(response).toEqual(
            expect.objectContaining({ type: 'OnFetchManyCacheData', refId: 'ref-1', success: true })
        );
    });

    it('핸들러가 던지면 반환값이 없어도 에러 응답은 나간다', async () => {
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb });
        host.registerHandler('SendLog', (() => {
            throw new Error('boom');
        }) as any);

        await host.handleMessage(JsonProtocol.encode({ type: 'SendLog', refId: 'ref-2', data: {} }) as string);

        const response = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(response).toEqual(expect.objectContaining({ type: 'ERROR', success: false }));
    });
});
