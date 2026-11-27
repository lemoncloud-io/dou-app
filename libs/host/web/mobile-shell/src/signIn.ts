import type { OAuthLoginProvider } from '@chatic/bridge-messages';
import type { SignInPort } from '@chatic/ports';

import type { ShellBridge } from './bridge';

export const PROVIDER_SIGN_IN_TIMEOUT_MS = 180_000;

export const mobileShellSignIn =
    (bridge: ShellBridge) =>
    (base: Pick<SignInPort, 'kind' | 'os'>): SignInPort => ({
        ...base,
        sessionScope: 'device',
        approvesPairing: true,
        requestsPairing: true,
        providerSignIn: {
            providers: (base.os === 'ios' ? ['google', 'apple'] : ['google']) satisfies OAuthLoginProvider[],
            start: provider => bridge.post({ type: 'OAuthLogin', data: { provider } }),
            onResult: listener => bridge.onEvent('OnOAuthLogin', outcome => listener(outcome)),
            credential: async provider =>
                (
                    await bridge.request(
                        { type: 'OAuthLogin', data: { provider } },
                        { timeoutMs: PROVIDER_SIGN_IN_TIMEOUT_MS }
                    )
                ).data.result,
        },
        relayOAuth: null,
    });
