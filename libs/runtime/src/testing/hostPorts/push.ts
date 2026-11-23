import type { PushPort } from '@chatic/runtime-client';

export const browserPush = (): PushPort => ({
    kind: 'browser',
    notifications: null,
    deviceToken: null,
    tokenRenewal: null,
    localBanner: null,
});
