import { logger } from '@chatic/bridges';
import type { LinksPort, SubWebViewOpenScope } from '@chatic/ports';

import type { ShellBridge } from './bridge';

export const SHARE_INTAKE_FETCH_TIMEOUT_MS = 10 * 60_000;

export const CONTACTS_READ_TIMEOUT_MS = 60_000;

export interface MobileShellLinksOptions {
    readonly bridge: ShellBridge;
    readonly subWebViewOpenScope: () => SubWebViewOpenScope | null;
}

export const mobileShellLinks =
    ({ bridge, subWebViewOpenScope }: MobileShellLinksOptions) =>
    (base: Pick<LinksPort, 'kind'>): LinksPort => ({
        ...base,
        openUrl: url => bridge.post({ type: 'OpenURL', data: { url } }),
        copyText: async text => {
            try {
                await bridge.request({ type: 'CopyToClipboard', data: { text } });
                return true;
            } catch (error) {
                logger.error('CLIPBOARD', 'Native CopyToClipboard request failed', { error });
                return false;
            }
        },
        shareSheet: { open: url => bridge.post({ type: 'OpenShareSheet', data: { url } }) },
        shareIntake: {
            fetch: async id => {
                const { data } = await bridge.request(
                    { type: 'FetchShareIntake', data: { id } },
                    { timeoutMs: SHARE_INTAKE_FETCH_TIMEOUT_MS }
                );
                return data;
            },
            release: async (id, { discard }) => {
                await bridge.request({ type: 'ReleaseShareIntake', data: { id, discard } });
            },
        },
        contacts: {
            read: async () =>
                (await bridge.request({ type: 'GetContacts', data: {} }, { timeoutMs: CONTACTS_READ_TIMEOUT_MS })).data,
        },
        sms: {
            compose: async (phoneNumbers, message) =>
                (await bridge.request({ type: 'SendSms', data: { phoneNumbers, message } })).data,
        },
        linkPreview: { fetch: async url => (await bridge.request({ type: 'FetchUrlMetadata', data: { url } })).data },
        subWebView: {
            openScope: async () => subWebViewOpenScope(),
            open: async (url, { title, params, appId } = {}) =>
                (
                    await bridge.request({
                        type: 'OpenSubWebView',
                        data: {
                            url,
                            ...(title ? { title } : {}),
                            ...(params ? { params } : {}),
                            ...(appId ? { appId } : {}),
                        },
                    })
                ).data.viewId,
            onClosed: listener => bridge.onEvent('OnSubWebViewClosed', message => listener(message.data)),
        },
    });
