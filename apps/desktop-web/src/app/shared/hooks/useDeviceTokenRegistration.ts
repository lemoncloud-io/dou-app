import { useMemo } from 'react';

import { hostProfile, webClient } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { host } from '@chatic/host';

const APPLICATION = 'chatic';
const DEFAULT_PLATFORM = 'desktop';

/**
 * Bridge-side adapter for the runtime's push registration.
 *
 * Registration policy (auth gating, once-per-install dedup, retry) lives in runtime-core's
 * `PushRegistration`, started through `runtime.push` — this file
 * only supplies the shell-specific pieces. It used to carry a second copy of that policy; ADR-0077
 * folded desktop onto the shared hook so both shells register the same way.
 *
 * The Electron main process registers `FetchFcmToken` as a real request handler
 * (`apps/desktop/src/main/index.ts`), so the token fetch is the same `webClient.request` call mobile
 * makes — no event round-trip of its own. It ALSO pushes `OnFetchFcmToken` unprompted when the token
 * is re-minted, which is what `subscribeTokenChange` forwards: desktop stays open for days, so
 * waiting for the next launch to notice a rotation would leave the endpoint stale for that long.
 *
 * Where the `push` port says the app does not receive notifications (outside the Electron shell) the
 * delegate is null and the runtime hook no-ops. The device's identity — platform, install id, stage — is
 * what the shell injected at boot, read from the host profile.
 */
export const useDeviceTokenRegistration = (): void => {
    const delegate = useMemo<runtime.push.DeviceTokenDelegate | null>(() => {
        if (host.ports.push.kind !== 'app') return null;
        const globals = hostProfile().globals;
        return {
            fetchDeviceToken: () =>
                webClient
                    .request({ type: 'FetchFcmToken', data: {} })
                    .then(response => response.data?.token ?? null)
                    // Main resolves '' when FCM is unconfigured or still registering; the runtime
                    // treats an empty token as a failure and retries on the next trigger.
                    .catch(() => null),
            platform: globals.CHATIC_APP_PLATFORM ?? DEFAULT_PLATFORM,
            installId: globals.CHATIC_APP_INSTALLATION_ID,
            application: APPLICATION,
            // Without an explicit stage the broker defaults to ITS default ('dev'), registering a
            // production desktop into the chatic-desktop-dev SNS app.
            stage: globals.CHATIC_APP_STAGE,
            subscribeTokenChange: onChange =>
                webClient.onEvent('OnFetchFcmToken', () => {
                    onChange();
                }),
        };
    }, []);

    runtime.push.useDeviceTokenRegistration(delegate);
};
