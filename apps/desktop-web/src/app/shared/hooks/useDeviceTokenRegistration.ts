import { useMemo } from 'react';

import { hostProfile } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

const APPLICATION = 'chatic';
const DEFAULT_PLATFORM = 'desktop';

export const useDeviceTokenRegistration = (): void => {
    const delegate = useMemo<runtime.push.DeviceTokenDelegate | null>(() => {
        const deviceToken = runtime.push.deviceToken;
        if (!deviceToken) return null;
        const tokenRenewal = runtime.push.tokenRenewal;
        const globals = hostProfile().globals;
        return {
            fetchDeviceToken: () => deviceToken.fetch().catch(() => null),
            platform: globals.CHATIC_APP_PLATFORM ?? DEFAULT_PLATFORM,
            installId: globals.CHATIC_APP_INSTALLATION_ID,
            application: APPLICATION,
            stage: globals.CHATIC_APP_STAGE,
            subscribeTokenChange: tokenRenewal ? onChange => tokenRenewal.onRenew(onChange) : undefined,
        };
    }, []);

    runtime.push.useDeviceTokenRegistration(delegate);
};
