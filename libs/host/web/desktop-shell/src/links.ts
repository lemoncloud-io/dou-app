import type { OnWebAppReadyPayload } from '@chatic/bridge-messages';
import { logger } from '@chatic/bridges';
import { pageLinks } from '@chatic/host-web-browser';
import type { LinksPort } from '@chatic/ports';

import type { DesktopShellBridge } from './bridge';

export const desktopShellLinks =
    (bridge: DesktopShellBridge) =>
    (base: Pick<LinksPort, 'kind'>): LinksPort => ({
        ...base,
        ...pageLinks,
        shareSheet: null,
        shareIntake: null,
        contacts: null,
        sms: null,
        linkPreview: {
            fetch: async url => (await bridge.request({ type: 'FetchUrlMetadata', data: { url } })).data,
        },
        subWebView: {
            openScope: async () => {
                try {
                    const response = await bridge.request({ type: 'WebAppReady', data: {} });
                    return (response?.data as OnWebAppReadyPayload | undefined)?.subWebViewOpenScope ?? null;
                } catch (error) {
                    logger.warn('BRIDGE', 'sub view handshake failed', { error });
                    return null;
                }
            },
            open: async (url, { title, params, appId } = {}) => {
                const response = await bridge.request({
                    type: 'OpenSubWebView',
                    data: {
                        url,
                        ...(title ? { title } : {}),
                        ...(params ? { params } : {}),
                        ...(appId ? { appId } : {}),
                    },
                });
                const viewId = response.data?.viewId;
                if (!viewId) throw new Error('OpenSubWebView answered without a viewId');
                return viewId;
            },
            onClosed: listener => bridge.onEvent('OnSubWebViewClosed', message => listener(message.data)),
        },
    });
