import { useMemo } from 'react';

import { hostProfile } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

const APPLICATION = 'chatic';
const DEFAULT_PLATFORM = 'desktop';

/**
 * Bridge-side adapter for the runtime's push registration.
 *
 * Registration policy (auth gating, once-per-install dedup, retry) lives in runtime-core's
 * `PushRegistration`, started through `runtime.push` — this file
 * only supplies the shell-specific pieces. It used to carry a second copy of that policy; desktop now
 * runs on the shared hook so both shells register the same way.
 *
 * The token and its renewals come from the `push` port: the desktop app answers the token request
 * itself, and announces each token it mints again — it stays open for days, so waiting for the next
 * launch to notice a rotation would leave the endpoint stale for that long.
 *
 * Where the app holds no token (outside the Electron shell) the delegate is null and the runtime hook
 * no-ops. The device's identity — platform, install id, stage — is what the shell injected at boot,
 * read from the host profile.
 */
export const useDeviceTokenRegistration = (): void => {
    const delegate = useMemo<runtime.push.DeviceTokenDelegate | null>(() => {
        const deviceToken = runtime.push.deviceToken;
        if (!deviceToken) return null;
        const tokenRenewal = runtime.push.tokenRenewal;
        const globals = hostProfile().globals;
        return {
            fetchDeviceToken: () =>
                deviceToken
                    .fetch()
                    // Main resolves '' when FCM is unconfigured or still registering; the runtime
                    // treats an empty token as a failure and retries on the next trigger.
                    .catch(() => null),
            platform: globals.CHATIC_APP_PLATFORM ?? DEFAULT_PLATFORM,
            installId: globals.CHATIC_APP_INSTALLATION_ID,
            application: APPLICATION,
            // Without an explicit stage the broker defaults to ITS default ('dev'), registering a
            // production desktop into the chatic-desktop-dev SNS app.
            stage: globals.CHATIC_APP_STAGE,
            subscribeTokenChange: tokenRenewal ? onChange => tokenRenewal.onRenew(onChange) : undefined,
        };
    }, []);

    runtime.push.useDeviceTokenRegistration(delegate);
};
