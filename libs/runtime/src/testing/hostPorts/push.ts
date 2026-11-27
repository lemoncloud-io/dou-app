import type { PushPort } from '../../api';

export const browserPush = (): PushPort => ({
    kind: 'browser',
    notifications: null,
    deviceToken: null,
    tokenRenewal: null,
    localBanner: null,
});
