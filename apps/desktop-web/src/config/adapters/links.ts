import type { OnWebAppReadyPayload } from '@chatic/bridge-messages';
import { logger, webClient } from '@chatic/bridges';
import { linksAdapters, pageLinks } from '@chatic/runtime-hybrid-web';
import type { LinksPort, ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

const noPhoneLinks = { shareSheet: null, shareIntake: null, contacts: null, sms: null } as const;

export const desktopLinks: ShellOrBrowserImplementations<'links'> = {
    shell: (base): LinksPort => ({
        ...base,
        ...pageLinks,
        ...noPhoneLinks,
        linkPreview: {
            fetch: async url => (await webClient.request({ type: 'FetchUrlMetadata', data: { url } })).data,
        },
        subWebView: {
            openScope: async () => {
                try {
                    const response = await webClient.request({ type: 'WebAppReady', data: {} });
                    return (response?.data as OnWebAppReadyPayload | undefined)?.subWebViewOpenScope ?? null;
                } catch (error) {
                    logger.warn('BRIDGE', 'sub view handshake failed', { error });
                    return null;
                }
            },
            open: async (url, { title, params, appId } = {}) => {
                const response = await webClient.request({
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
            onClosed: listener => webClient.onEvent('OnSubWebViewClosed', message => listener(message.data)),
        },
    }),
    browser: (base): LinksPort => ({
        ...base,
        ...pageLinks,
        ...noPhoneLinks,
        linkPreview: null,
        subWebView: null,
    }),
};

export const { host: linksHost, shell: linksShell, browser: linksBrowser } = linksAdapters(desktopLinks);
