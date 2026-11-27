import type { SignInPort } from '@chatic/ports';

import type { DesktopShellBridge } from './bridge';
import { desktopShellNotificationFeed } from './notificationFeed';

export const desktopShellSignIn =
    (bridge: Pick<DesktopShellBridge, 'onEvent'>) =>
    (base: Pick<SignInPort, 'kind' | 'os'>): SignInPort => ({
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
                    desktopShellNotificationFeed(bridge)(payload => {
                        const deeplink: unknown = payload.notification?.data?.deeplink;
                        if (typeof deeplink === 'string' && deeplink) listener(deeplink);
                    }),
            },
        },
    });

export const desktopBrowserSignIn = (base: Pick<SignInPort, 'kind' | 'os'>): SignInPort => ({
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
});
