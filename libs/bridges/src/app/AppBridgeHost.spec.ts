import { AppBridgeHost } from './AppBridgeHost';
import { JsonProtocol } from '../common';
import { BRIDGE_VERSION } from '../version';

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

        host.pushEvent({ type: 'OnBackPressed', data: {} } as any);
        expect(mockSendToWeb).not.toHaveBeenCalled();

        const webAppReadyRequest = JsonProtocol.encode({
            type: 'WebAppReady',
            refId: '123',
            version: BRIDGE_VERSION,
            data: {},
        } as any);

        await host.handleMessage(webAppReadyRequest as string);

        expect(mockSendToWeb).toHaveBeenCalledTimes(2);

        const firstCallMsg = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(firstCallMsg.type).toBe('OnBackPressed');

        const secondCallMsg = JsonProtocol.decode(mockSendToWeb.mock.calls[1][0]) as any;
        expect(secondCallMsg.type).toBe('OnWebAppReady');
        expect(secondCallMsg.refId).toBe('123');
        expect(secondCallMsg.success).toBe(true);
        expect(secondCallMsg.data).toEqual(
            expect.objectContaining({
                appVersion: BRIDGE_VERSION,
                protocolVersion: BRIDGE_VERSION,
                supportedWebMessages: expect.arrayContaining(['WebAppReady', 'Ping']),
                supportedAppMessages: expect.arrayContaining(['OnWebAppReady', 'Pong']),
            })
        );
    });

    it('hands the WebAppReady declaration to onAppReady', async () => {
        const onAppReady = jest.fn();
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb, protocol: JsonProtocol, onAppReady });

        const ready = (data: unknown) =>
            JsonProtocol.encode({ type: 'WebAppReady', refId: 'r', version: BRIDGE_VERSION, data } as any);

        await host.handleMessage(ready({ holdsBootSplash: true }) as string);
        expect(onAppReady).toHaveBeenLastCalledWith({ holdsBootSplash: true });

        await host.handleMessage(ready(undefined) as string);
        expect(onAppReady).toHaveBeenLastCalledWith({});
    });

    it('reports local-cache capability only when the host declares it', async () => {
        const readyRequest = JsonProtocol.encode({
            type: 'WebAppReady',
            refId: '1',
            version: BRIDGE_VERSION,
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

    describe('per-domain cache contract versions', () => {
        const readyRequest = () =>
            JsonProtocol.encode({
                type: 'WebAppReady',
                refId: '1',
                version: BRIDGE_VERSION,
                data: {},
            } as any) as string;

        const replyData = () => (JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any).data;

        it('reports the resolved versions and derives supportedCacheTypes from them', async () => {
            const host = new AppBridgeHost({
                sendToWeb: mockSendToWeb,
                protocol: JsonProtocol,
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

        host.registerHandler('Ping' as any, async msg => {
            return {
                type: 'Ping',
                success: true,
                data: { pong: msg.data?.payload },
            } as any;
        });

        host.pushEvent({ type: 'OnBackPressed', data: {} } as any);
        expect(mockSendToWeb).not.toHaveBeenCalled();

        const pingRequest = JsonProtocol.encode({
            type: 'Ping',
            refId: 'ping-id',
            version: BRIDGE_VERSION,
            data: { payload: 'hello' },
        } as any);

        await host.handleMessage(pingRequest as string);

        expect(mockSendToWeb).toHaveBeenCalledTimes(2);

        const firstCall = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(firstCall.type).toBe('OnBackPressed');

        const secondCall = JsonProtocol.decode(mockSendToWeb.mock.calls[1][0]) as any;
        expect(secondCall.type).toBe('Ping');
        expect(secondCall.refId).toBe('ping-id');
        expect(secondCall.data.pong).toBe('hello');
    });

    it('does not take the boot-time vault read as the web being ready, so a cold-start event survives it', async () => {
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb, protocol: JsonProtocol });
        host.registerHandler(
            'StorageGet' as any,
            async () => ({ type: 'OnStorageGet', success: true, data: { status: 'available', values: {} } }) as any
        );
        host.pushEvent({ type: 'OnNavigate', data: { path: '/channels/1/room' } } as any);

        await host.handleMessage(
            JsonProtocol.encode({
                type: 'StorageGet',
                refId: 'vault-1',
                version: BRIDGE_VERSION,
                data: { medium: 'nativeSecure' },
            } as any) as string
        );

        expect(mockSendToWeb).toHaveBeenCalledTimes(1);
        expect((JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any).type).toBe('OnStorageGet');
    });

    it('does not take the boot-time runtime handshake as the web being ready, so a cold-start event survives it', async () => {
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb, protocol: JsonProtocol });
        host.registerHandler(
            'RuntimeHello' as any,
            async () => ({ type: 'OnRuntimeHello', success: true, data: { sessionOwner: 'web' } }) as any
        );
        host.pushEvent({ type: 'OnNavigate', data: { path: '/channels/1/room' } } as any);

        await host.handleMessage(
            JsonProtocol.encode({
                type: 'RuntimeHello',
                refId: 'hello-1',
                version: BRIDGE_VERSION,
                data: { contracts: [1] },
            } as any) as string
        );

        expect(mockSendToWeb).toHaveBeenCalledTimes(1);
        expect((JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any).type).toBe('OnRuntimeHello');
    });

    it.each(['RuntimeCall', 'RuntimeSubscribe', 'RuntimeUnsubscribe'])(
        'does not take the boot-time %s as the web being ready either',
        async type => {
            const host = new AppBridgeHost({ sendToWeb: mockSendToWeb, protocol: JsonProtocol });
            host.registerHandler(type as any, async () => ({ type: `On${type}`, success: true, data: {} }) as any);
            host.pushEvent({ type: 'OnNavigate', data: { path: '/channels/1/room' } } as any);

            await host.handleMessage(
                JsonProtocol.encode({ type, refId: 'r-1', version: BRIDGE_VERSION, data: {} } as any) as string
            );

            expect(mockSendToWeb).toHaveBeenCalledTimes(1);
            expect((JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any).type).toBe(`On${type}`);
        }
    );

    it('SendLog 릴레이는 웹 준비 신호로 취급하지 않아 버퍼를 플러시하지 않는다 (cold start 유실 방지)', async () => {
        const host = new AppBridgeHost({
            sendToWeb: mockSendToWeb,
            protocol: JsonProtocol,
        });

        host.registerHandler('SendLog' as any, async () => ({ type: 'OnSendLog', success: true, data: {} }) as any);
        host.registerHandler('Ping' as any, async () => ({ type: 'Ping', success: true, data: {} }) as any);

        host.pushEvent({ type: 'OnNavigate', data: { path: '/channels/1/room' } } as any);

        await host.handleMessage(
            JsonProtocol.encode({
                type: 'SendLog',
                refId: 'log-1',
                version: BRIDGE_VERSION,
                data: { level: 'info', tag: 'WEB_CORE', message: 'booting' },
            } as any) as string
        );

        expect(mockSendToWeb).toHaveBeenCalledTimes(1);
        const logResponse = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(logResponse.type).toBe('OnSendLog');

        await host.handleMessage(
            JsonProtocol.encode({
                type: 'Ping',
                refId: 'ping-1',
                version: BRIDGE_VERSION,
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

        await host.handleMessage(
            JsonProtocol.encode({
                type: 'WebAppReady',
                refId: 'ready-ref',
                version: BRIDGE_VERSION,
                data: {},
            } as any) as string
        );

        mockSendToWeb.mockClear();

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
                data: { type: 'chat', ids: ['c1'], cid: 'cloud-a', uid: 'me' },
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

        await host.handleMessage(
            JsonProtocol.encode({ type: 'SendLog', refId: 'ref-2', data: { message: 'boom' } }) as string
        );

        const response = JsonProtocol.decode(mockSendToWeb.mock.calls[0][0]) as any;
        expect(response).toEqual(expect.objectContaining({ type: 'ERROR', success: false }));
    });
});

describe('AppBridgeHost handshake capability lists', () => {
    let mockSendToWeb: jest.Mock;

    beforeEach(() => {
        mockSendToWeb = jest.fn();
    });

    const handshake = async (host: AppBridgeHost) => {
        await host.handleMessage(JsonProtocol.encode({ type: 'WebAppReady', refId: 'ready', data: {} }) as string);
        const reply = mockSendToWeb.mock.calls
            .map(call => JsonProtocol.decode(call[0]) as any)
            .find(message => message.refId === 'ready');
        return reply.data as { supportedWebMessages: string[]; supportedAppMessages: string[] };
    };

    it('advertises only what the host itself answers when the shell registers nothing', async () => {
        const report = await handshake(new AppBridgeHost({ sendToWeb: mockSendToWeb }));

        expect(report.supportedWebMessages.sort()).toEqual(['Ping', 'WebAppReady']);
        expect(report.supportedAppMessages.sort()).toEqual(['OnWebAppReady', 'Pong']);
    });

    it('advertises a registered handler with its paired reply, and drops one unregistered', async () => {
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb });
        host.registerHandler('SaveToPhotoLibrary', jest.fn());
        host.registerHandler('ShareFile', jest.fn());
        host.unregisterHandler('ShareFile');

        const report = await handshake(host);

        expect(report.supportedWebMessages).toContain('SaveToPhotoLibrary');
        expect(report.supportedAppMessages).toContain('OnSaveToPhotoLibrary');
        expect(report.supportedWebMessages).not.toContain('ShareFile');
        expect(report.supportedAppMessages).not.toContain('OnShareFile');
    });

    it('reports the handlers registered at the time of each handshake', async () => {
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb });
        const before = await handshake(host);
        host.registerHandler('StartPerfTrace', jest.fn());
        mockSendToWeb.mockClear();

        const after = await handshake(host);

        expect(before.supportedWebMessages).not.toContain('StartPerfTrace');
        expect(after.supportedWebMessages).toContain('StartPerfTrace');
    });

    it('reports how far it opens sub WebViews only when the shell says so', async () => {
        const silent = (await handshake(new AppBridgeHost({ sendToWeb: mockSendToWeb }))) as Record<string, unknown>;
        mockSendToWeb.mockClear();
        const wide = (await handshake(
            new AppBridgeHost({ sendToWeb: mockSendToWeb, subWebViewOpenScope: 'anyHttps' })
        )) as Record<string, unknown>;

        expect('subWebViewOpenScope' in silent).toBe(false);
        expect(wide.subWebViewOpenScope).toBe('anyHttps');
    });

    it('answers Ping with a Pong carrying the payload back', async () => {
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb });

        await host.handleMessage(JsonProtocol.encode({ type: 'Ping', refId: 'p1', data: { payload: 'hi' } }) as string);
        await host.handleMessage(JsonProtocol.encode({ type: 'Ping', refId: 'p2', data: {} } as any) as string);

        const [withPayload, without] = mockSendToWeb.mock.calls.map(call => JsonProtocol.decode(call[0]) as any);
        expect(withPayload).toEqual(
            expect.objectContaining({ type: 'Pong', refId: 'p1', success: true, data: { payload: 'hi' } })
        );
        expect(without).toEqual(expect.objectContaining({ type: 'Pong', refId: 'p2', data: { payload: '' } }));
    });
});

describe('AppBridgeHost sub WebView options', () => {
    let mockSendToWeb: jest.Mock;

    beforeEach(() => {
        mockSendToWeb = jest.fn();
    });

    const replies = () => mockSendToWeb.mock.calls.map(call => JsonProtocol.decode(call[0]) as any);
    const ready = JsonProtocol.encode({ type: 'WebAppReady', refId: 'ready', data: {} }) as string;

    it('reports the sub WebView context in the handshake, read when the reply is built', async () => {
        let theme: 'light' | 'dark' = 'light';
        const host = new AppBridgeHost({
            sendToWeb: mockSendToWeb,
            subWebViewContext: () => ({
                protocolVersion: 1,
                viewId: 'v1',
                platform: 'ios',
                appVersion: '0.31.0',
                locale: 'ko',
                theme,
                params: { level: 2 },
            }),
        });
        theme = 'dark';

        await host.handleMessage(ready);

        expect(replies()[0].data.subWebView).toEqual(
            expect.objectContaining({ protocolVersion: 1, viewId: 'v1', theme: 'dark', params: { level: 2 } })
        );
    });

    it('leaves the context out of a host that has none', async () => {
        await new AppBridgeHost({ sendToWeb: mockSendToWeb }).handleMessage(ready);

        expect(replies()[0].data).not.toHaveProperty('subWebView');
    });

    it('answers a message over the limit with TOO_LARGE and keeps it from its handler', async () => {
        const handler = jest.fn(() => ({ type: 'OnCopyToClipboard', success: true, data: { copied: true } }));
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb, maxMessageLength: 200 });
        host.registerHandler('CopyToClipboard', handler as never);

        await host.handleMessage(
            JsonProtocol.encode({ type: 'CopyToClipboard', refId: 'big', data: { text: 'x'.repeat(300) } }) as string
        );

        expect(handler).not.toHaveBeenCalled();
        expect(replies()[0]).toEqual(
            expect.objectContaining({
                type: 'ERROR',
                refId: 'big',
                success: false,
                error: expect.objectContaining({ code: 'TOO_LARGE', requestType: 'CopyToClipboard' }),
            })
        );
    });

    it('hands a message at the limit to its handler', async () => {
        const handler = jest.fn(() => ({ type: 'OnCopyToClipboard', success: true, data: { copied: true } }));
        const message = JsonProtocol.encode({ type: 'CopyToClipboard', refId: 'ok', data: { text: 'hi' } }) as string;
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb, maxMessageLength: message.length });
        host.registerHandler('CopyToClipboard', handler as never);

        await host.handleMessage(message);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(replies()[0]).toEqual(expect.objectContaining({ type: 'OnCopyToClipboard', refId: 'ok' }));
    });

    it('releases held pushes on a message it refuses as too large', async () => {
        const host = new AppBridgeHost({ sendToWeb: mockSendToWeb, maxMessageLength: 10 });
        host.pushEvent({ type: 'OnBackPressed', success: true, data: {} });

        await host.handleMessage(
            JsonProtocol.encode({ type: 'Ping', refId: 'p', data: { payload: 'long' } }) as string
        );

        expect(replies().map(message => message.type)).toEqual(['OnBackPressed', 'ERROR']);
    });
});
