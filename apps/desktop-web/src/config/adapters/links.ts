import type { OnWebAppReadyPayload } from '@chatic/bridge-messages';
import { logger, webClient } from '@chatic/bridges';
import { linksAdapters, pageLinks } from '@chatic/runtime-web';
import type { LinksPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

/** What neither side of desktop-web has: these are the phone's. */
const noPhoneLinks = { shareSheet: null, shareIntake: null, contacts: null, sms: null } as const;

/**
 * Who takes the page's links out of it in desktop-web: the shell or the page. Its shell is the desktop
 * app, reached through `webClient` requests, which reads a link's preview and runs the sub web view; the
 * page uses what any browser offers.
 */
export const desktopLinks: ShellOrBrowserImplementations<'links'> = {
    shell: (base): LinksPort => ({
        ...base,
        // The desktop app leaves `OpenURL` and `CopyToClipboard` unanswered, and sends a window the page
        // opens to the OS browser itself: the page's own way is the shell's too.
        ...pageLinks,
        ...noPhoneLinks,
        // The main process fetches the page and parses its tags: the renderer cannot read another origin.
        linkPreview: {
            fetch: async url => (await webClient.request({ type: 'FetchUrlMetadata', data: { url } })).data,
        },
        subWebView: {
            // desktop-web sends no handshake at startup; this one is asked for here alone, and the desktop
            // app answers it without side effects.
            openScope: async () => {
                try {
                    const response = await webClient.request({ type: 'WebAppReady', data: {} });
                    return (response?.data as OnWebAppReadyPayload | undefined)?.subWebViewOpenScope ?? null;
                } catch (error) {
                    // Still "not offered", but a failed handshake is not a shell that said no: it leaves a trace.
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

/** `links.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: linksHost, shell: linksShell, browser: linksBrowser } = linksAdapters(desktopLinks);
