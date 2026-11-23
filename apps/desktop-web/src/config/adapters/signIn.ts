import { signInAdapters } from '@chatic/runtime-web';
import type { ShellOrBrowserImplementations, SignInPort } from '@chatic/runtime-web';

import { onDesktopNotification } from './notificationFeed';

export const desktopSignIn: ShellOrBrowserImplementations<'signIn'> = {
    shell: (base): SignInPort => ({
        ...base,
        sessionScope: 'device',
        approvesPairing: true,
        requestsPairing: false,
        providerSignIn: null,
        relayOAuth: {
            openAuthorize: url => {
                window.open(url, '_blank');
            },
            returnedCode: 'complete',
            handoffLinks: {
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
        sessionScope: 'tab',
        approvesPairing: false,
        requestsPairing: true,
        providerSignIn: null,
        relayOAuth: {
            openAuthorize: url => window.location.assign(url),
            returnedCode: 'handoff',
            handoffLinks: null,
        },
    }),
};

export const { host: signInHost, shell: signInShell, browser: signInBrowser } = signInAdapters(desktopSignIn);
