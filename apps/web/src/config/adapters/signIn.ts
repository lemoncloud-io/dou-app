import { webClient } from '@chatic/bridges';
import type { OAuthLoginProvider } from '@chatic/bridge-messages';
import { signInAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations, SignInPort } from '@chatic/runtime-hybrid-web';

import { appBridge } from '../../app/bridge/appBridge';

export const webSignIn: ShellOrBrowserImplementations<'signIn'> = {
    shell: (base): SignInPort => ({
        ...base,
        sessionScope: 'device',
        approvesPairing: true,
        requestsPairing: true,
        providerSignIn: {
            providers: (base.os === 'ios' ? ['google', 'apple'] : ['google']) satisfies OAuthLoginProvider[],
            start: provider => appBridge.startOAuthLogin(provider),
            onResult: listener => webClient.onEvent('OnOAuthLogin', outcome => listener(outcome)),
            credential: async provider => (await appBridge.oauthLogin(provider)).data.result,
        },
        relayOAuth: null,
    }),
    browser: (base): SignInPort => ({
        ...base,
        sessionScope: 'tab',
        approvesPairing: false,
        requestsPairing: true,
        providerSignIn: null,
        relayOAuth: null,
    }),
};

export const { host: signInHost, shell: signInShell, browser: signInBrowser } = signInAdapters(webSignIn);
