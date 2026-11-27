import type { PushPort } from '@chatic/ports';

import type { ShellBridge } from './bridge';

export const mobileShellPush =
    (bridge: ShellBridge) =>
    (base: Pick<PushPort, 'kind'>): PushPort => ({
        ...base,
        notifications: {
            onReceive: listener =>
                bridge.onEvent('OnReceiveNotification', message => {
                    const payload = message.data;
                    if (!payload) return;
                    listener(payload);
                }),
        },
        deviceToken: {
            fetch: async () => (await bridge.request({ type: 'FetchFcmToken', data: {} }))?.data?.token ?? null,
        },
        tokenRenewal: null,
        localBanner: null,
    });
