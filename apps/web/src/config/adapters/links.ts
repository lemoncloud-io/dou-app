import { logger, webClient } from '@chatic/bridges';
import { linksAdapters, pageLinks } from '@chatic/runtime-web';
import type { LinksPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

import { appBridge } from '../../app/bridge/appBridge';
import { shellCapabilities } from '../../app/bridge/shellCapabilities';

export const SHARE_INTAKE_FETCH_TIMEOUT_MS = 10 * 60_000;

export const webLinks: ShellOrBrowserImplementations<'links'> = {
    shell: (base): LinksPort => ({
        ...base,
        openUrl: url => appBridge.openURL(url),
        copyText: async text => {
            try {
                await appBridge.copyClipBoard(text);
                return true;
            } catch (error) {
                logger.error('CLIPBOARD', 'Native CopyToClipboard request failed', { error });
                return false;
            }
        },
        shareSheet: { open: url => appBridge.openShareSheet(url) },
        shareIntake: {
            fetch: async id => {
                const { data } = await webClient.request(
                    { type: 'FetchShareIntake', data: { id } },
                    { timeoutMs: SHARE_INTAKE_FETCH_TIMEOUT_MS }
                );
                return data;
            },
            release: async (id, { discard }) => {
                await webClient.request({ type: 'ReleaseShareIntake', data: { id, discard } });
            },
        },
        contacts: { read: async () => (await appBridge.getContacts()).data },
        sms: { compose: async (phoneNumbers, message) => (await appBridge.sendSms(phoneNumbers, message)).data },
        linkPreview: { fetch: async url => (await appBridge.fetchUrlMetadata(url)).data },
        subWebView: {
            openScope: async () => shellCapabilities.subWebViewOpenScope(),
            open: async (url, { title, params, appId } = {}) =>
                (await appBridge.openSubWebView(url, title, params, appId)).data.viewId,
            onClosed: listener => webClient.onEvent('OnSubWebViewClosed', message => listener(message.data)),
        },
    }),
    browser: (base): LinksPort => ({
        ...base,
        ...pageLinks,
        shareSheet: null,
        shareIntake: null,
        contacts: null,
        sms: null,
        linkPreview: null,
        subWebView: null,
    }),
};

export const { host: linksHost, shell: linksShell, browser: linksBrowser } = linksAdapters(webLinks);
