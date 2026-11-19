import { logger, webClient } from '@chatic/bridges';
import { linksAdapters, pageLinks } from '@chatic/runtime-web';
import type { LinksPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

// Direct paths, not the `bridge` barrel: the barrel re-exports its navigation, which pulls in the
// web transport and its `import.meta.env` — a syntax error under ts-jest's CommonJS output.
import { appBridge } from '../../app/bridge/appBridge';
import { shellCapabilities } from '../../app/bridge/shellCapabilities';

/**
 * How long a share's items may take to arrive. Android copies them after it has opened the app, and
 * answers once the last copy is written: a few large videos take a while. Bounded like a conversion,
 * not like a picker that waits on a person.
 */
export const SHARE_INTAKE_FETCH_TIMEOUT_MS = 10 * 60_000;

/**
 * Who takes the page's links out of it in the web app: the shell or the page. Its shell is the phone
 * app, reached through `appBridge`; the page uses what any browser offers, and has no share sheet,
 * address book, text composer, preview reader or sub web view.
 */
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
        // `data` is absent from the apps that answer an opened composer with a bare success.
        sms: { compose: async (phoneNumbers, message) => (await appBridge.sendSms(phoneNumbers, message)).data },
        linkPreview: { fetch: async url => (await appBridge.fetchUrlMetadata(url)).data },
        subWebView: {
            // The phone app sent its handshake at boot; this reads what it said, `null` until it lands.
            openScope: async () => shellCapabilities.subWebViewOpenScope(),
            open: async (url, { title, params, appId } = {}) =>
                (await appBridge.openSubWebView(url, title, params, appId)).data.viewId,
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

/** `links.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: linksHost, shell: linksShell, browser: linksBrowser } = linksAdapters(webLinks);
