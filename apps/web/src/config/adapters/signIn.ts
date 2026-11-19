import { webClient } from '@chatic/bridges';
import type { OAuthLoginProvider } from '@chatic/bridge-messages';
import { signInAdapters } from '@chatic/runtime-web';
import type { ShellOrBrowserImplementations, SignInPort } from '@chatic/runtime-web';

// A direct path, not the `bridge` barrel: the barrel re-exports its navigation, which pulls in the
// web transport and its `import.meta.env` — a syntax error under ts-jest's CommonJS output.
import { appBridge } from '../../app/bridge/appBridge';

/**
 * Who signs a person in, links accounts and pairs a second device in the web app: the shell or the page.
 * Its shell is the phone app, reached through `appBridge`, which signs in with the providers' own SDKs
 * (the virtual phone shell through the OAuth relay, answering with the relay's code) and approves
 * pairings; the page has no social sign-in of its own — a browser cannot obtain the raw
 * provider token linking needs — and only asks to pair.
 *
 * Neither side signs in through the OAuth relay: that is desktop-web's way.
 */
export const webSignIn: ShellOrBrowserImplementations<'signIn'> = {
    shell: (base): SignInPort => ({
        ...base,
        // The app keeps its own device registration, and a sign-in it got through an approval makes it
        // a secondary device that signs out with its approver.
        sessionScope: 'device',
        approvesPairing: true,
        // Not gated: a phone may sign in through another phone's approval too.
        requestsPairing: true,
        providerSignIn: {
            // Sign in with Apple is offered on iOS only, where the platform has it.
            providers: (base.os === 'ios' ? ['google', 'apple'] : ['google']) satisfies OAuthLoginProvider[],
            // Sign-in fires the request and listens for the answer apart from it, with no clock: the
            // person may take as long as they like at the provider's screens. The app reports every
            // outcome — credential, cancel and failure — as an `OnOAuthLogin` message.
            start: provider => appBridge.startOAuthLogin(provider),
            // Wrapped: the client keeps its listeners in a set, so passing `listener` itself would let
            // a second subscription of the same function share — and lose with — the first's.
            onResult: listener => webClient.onEvent('OnOAuthLogin', outcome => listener(outcome)),
            // Linking awaits the same flow as one request, under the long budget `oauthLogin` gives it.
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

/** `signIn.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: signInHost, shell: signInShell, browser: signInBrowser } = signInAdapters(webSignIn);
