import { BRIDGE_VERSION, JsonProtocol } from '@chatic/bridges';
import type { SubWebViewRequestType } from '@chatic/app-messages';

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
];

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
        })
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
