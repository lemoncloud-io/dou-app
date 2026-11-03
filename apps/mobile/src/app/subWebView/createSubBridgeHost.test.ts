import { BRIDGE_VERSION, JsonProtocol } from '@chatic/bridges';
import type { SubWebViewRequestType } from '@chatic/bridge-messages';

import { SubWebViewService } from '../services/subWebView/SubWebViewService';
import { createSubBridgeHost } from './createSubBridgeHost';
import { createSubBridgeHandlers } from './subBridgeHandlers';

// Typed by the subset, so a name that is not in it fails to compile; the test then checks that the
// host lists exactly these, no more and no fewer.
const SUBSET: SubWebViewRequestType[] = [
    'WebAppReady',
    'Ping',
    'FinishSubWebView',
    'SetSubWebViewTitle',
    'CopyToClipboard',
    'TriggerHaptic',
    'OpenURL',
    'OpenShareSheet',
    'GetSubWebViewUserKey',
    'SetCanGoBack',
    'SetSubWebViewCloseGuard',
    'ReportSubWebViewError',
];

const CONTEXT = {
    protocolVersion: 1 as const,
    viewId: 'view-1',
    platform: 'ios' as const,
    appVersion: '0.31.0',
    locale: 'ko',
    theme: 'light' as const,
    params: {},
};

const createHost = () => {
    const sent: string[] = [];
    const host = createSubBridgeHost(
        message => sent.push(message),
        createSubBridgeHandlers({
            viewId: 'view-1',
            service: new SubWebViewService({ warn: jest.fn(), error: jest.fn() } as any, ['apps.chatic.io']),
            clipboard: { setText: jest.fn(async () => undefined) },
            haptic: { trigger: jest.fn(() => true) },
            openExternal: jest.fn(async () => undefined),
            setTitle: jest.fn(),
            openShareSheet: jest.fn(async () => ({ action: 'sharedAction' as const })),
            origin: 'https://foo.apps.chatic.io',
            getDeviceId: () => 'device-1',
            setBackClaim: jest.fn(),
            setCloseGuard: jest.fn(),
            logPageError: jest.fn(),
        }),
        () => CONTEXT
    );
    return { host, sent };
};

const request = (type: string, data: unknown) =>
    JsonProtocol.encode({ type, refId: `r-${type}`, version: BRIDGE_VERSION, data } as any) as string;

describe('createSubBridgeHost', () => {
    it('lists exactly the sub WebView subset in its handshake', async () => {
        const { host, sent } = createHost();

        await host.handleMessage(request('WebAppReady', {}));

        const reply = JSON.parse(sent[sent.length - 1]);
        expect(reply.type).toBe('OnWebAppReady');
        expect([...reply.data.supportedWebMessages].sort()).toEqual([...SUBSET].sort());
        // A host with no local cache reports none, so a page never routes storage here.
        expect(reply.data.supportedCacheTypes ?? []).toEqual([]);
        expect(reply.data.subWebView).toEqual(CONTEXT);
    });

    it('refuses a message over 65,536 characters, and handles one under it', async () => {
        const { host, sent } = createHost();

        await host.handleMessage(request('SetSubWebViewTitle', { title: 'x'.repeat(64 * 1024) }));
        await host.handleMessage(request('SetSubWebViewTitle', { title: 'Quiz' }));

        const [tooLarge, handled] = sent.map(raw => JSON.parse(raw));
        expect(tooLarge).toEqual(
            expect.objectContaining({ type: 'ERROR', error: expect.objectContaining({ code: 'TOO_LARGE' }) })
        );
        expect(handled).toEqual(expect.objectContaining({ type: 'OnSetSubWebViewTitle', success: true }));
    });

    // The main WebView's requests are not merely unlisted: the host answers them NOT_FOUND.
    it.each(['FetchCacheData', 'FetchFcmToken', 'Purchase', 'StartFileTransfer', 'SendLog', 'OpenSubWebView'])(
        'answers %s with NOT_FOUND',
        async type => {
            const { host, sent } = createHost();

            await host.handleMessage(request(type, {}));

            const reply = JSON.parse(sent[sent.length - 1]);
            expect(reply.success).toBe(false);
            expect(reply.error.code).toBe('NOT_FOUND');
        }
    );
});
