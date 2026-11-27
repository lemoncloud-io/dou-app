import type { RuntimePlatform } from '@chatic/runtime/api/platform';

export const webPlatform: RuntimePlatform = {
    issueOrigin: {
        hasShellBridge: () => false,
        pageUrl: () => window.location.href,
    },
    device: () => ({
        appPlatform: undefined,
        userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    }),
};
