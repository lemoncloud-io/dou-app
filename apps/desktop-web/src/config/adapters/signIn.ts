import { signInAdapters } from '@chatic/runtime-web';
import type { ShellOrBrowserImplementations, SignInPort } from '@chatic/runtime-web';

import { onDesktopNotification } from './notificationFeed';

/**
 * Who signs a person in, links accounts and pairs a second device in desktop-web: the shell or the page.
 * Its shell is the desktop app, reached through `webClient` requests; the page uses what any browser
 * offers. Both sign in through the OAuth relay, and neither has a provider sign-in of its own.
 *
 * Pairing runs the other way round from the phone's: the desktop app signs in on its own and approves,
 * and only a browser tab asks — a code shown inside the app would ask a phone to approve the app beside it.
 */
export const desktopSignIn: ShellOrBrowserImplementations<'signIn'> = {
    shell: (base): SignInPort => ({
        ...base,
        sessionScope: 'device',
        approvesPairing: true,
        requestsPairing: false,
        providerSignIn: null,
        relayOAuth: {
            // The window-open handler routes untrusted https to the system browser; navigating the app's
            // own window away is blocked (`will-navigate`).
            openAuthorize: url => {
                window.open(url, '_blank');
            },
            // A return that landed in the app window is where the sign-in is wanted: exchange it there.
            returnedCode: 'complete',
            handoffLinks: {
                // The app forwards every deeplink it is opened with as an `OnReceiveNotification` event —
                // the message `push` reads its notifications from — under `notification.data.deeplink`.
                subscribe: listener =>
                    onDesktopNotification(payload => {
                        const deeplink: unknown = payload.notification?.data?.deeplink;
                        if (typeof deeplink === 'string' && deeplink) listener(deeplink);
                    }),
            },
        },
    }),
    browser: (base): SignInPort => ({
        ...base,
        // Closing the tab ends the sign-in.
        sessionScope: 'tab',
        approvesPairing: false,
        requestsPairing: true,
        providerSignIn: null,
        relayOAuth: {
            openAuthorize: url => window.location.assign(url),
            // In the system browser, the return page hands the code back to the app that started the sign-in.
            returnedCode: 'handoff',
            handoffLinks: null,
        },
    }),
};

/** `signIn.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: signInHost, shell: signInShell, browser: signInBrowser } = signInAdapters(desktopSignIn);
