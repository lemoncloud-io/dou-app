import { hostProfile } from '@chatic/bridges';
import type { RuntimePlatform } from '@chatic/runtime/api/platform';

export const webPlatform: RuntimePlatform = {
    issueOrigin: {
        hasShellBridge: () => hostProfile().bridge !== null,
        pageUrl: () => window.location.href,
    },
    device: () => ({
        appPlatform: hostProfile().globals.CHATIC_APP_PLATFORM,
        userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    }),
};
