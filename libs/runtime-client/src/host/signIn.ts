import type { AppMessageData, OAuthLoginProvider, OAuthLoginResult } from '@chatic/bridge-messages';

import type { HostOs, ShellOrBrowser } from './ports';

/**
 * Who signs a person in with a social provider, links accounts, and holds the account a second
 * device pairs with. `shell` — the app does, with the platform's own sign-in where it has one (`os`
 * says which), and this device can approve a pairing; `browser` — the page does, and this device is
 * the one that asks to pair.
 *
 * What every host answers, each in its own way, is a field or a method. What only some hosts have — the
 * app's own provider sign-in, a sign-in through the OAuth relay — is a member that is `null` where the
 * host has none, so a feature asks for the member, not for the side. The web app and desktop-web answer
 * pairing differently, so each fills the pairing fields with its own values.
 */
export interface SignInPort {
    readonly kind: ShellOrBrowser;
    readonly os: HostOs;
    /**
     * How long a sign-in made here lasts. `device` — it belongs to this install of the app, which keeps
     * its own device registration (a guest included) and, when it signed in through an approval, signs
     * out with its approver. `tab` — it belongs to a browser tab and ends when the tab closes.
     */
    readonly sessionScope: 'device' | 'tab';
    /**
     * Whether this device may approve another device's pairing request: hand on the sign-in it holds.
     * Only an app approves; the screens still require an account that signed in for itself.
     */
    readonly approvesPairing: boolean;
    /**
     * Whether this device may ask another to approve it — show a pairing code to sign in with. `false`
     * where the device signs in on its own and a code would ask a phone to approve the app beside it.
     */
    readonly requestsPairing: boolean;
    /**
     * The app's own sign-in with a social provider, which hands the page the credential it got. `null`
     * where there is none: a browser, and the desktop app, whose page signs in through `relayOAuth`.
     */
    readonly providerSignIn: ProviderSignIn | null;
    /**
     * A sign-in through the OAuth relay, which runs the provider's web flow in a real browser and comes
     * back with a relay code. `null` where the page does not sign in through the relay.
     */
    readonly relayOAuth: RelayOAuth | null;
}

/**
 * The app's own sign-in with a social provider, in two shapes: `start` and `onResult` for signing in,
 * where the answer may come back whenever the person is done; `credential` for linking an account, which
 * needs the credential in hand to go on with.
 *
 * Either way the credential is a provider token from a phone app, or a relay code from the virtual phone
 * shell: it stands in for the phone app, but signs in through the OAuth relay in a real browser and
 * answers with the relay's code. Tell them apart by `code`.
 */
export interface ProviderSignIn {
    /** The providers the app signs in with, in the order a screen offers them. Apple only on iOS. */
    readonly providers: readonly OAuthLoginProvider[];
    /**
     * Starts the provider's sign-in and returns at once; the outcome arrives through `onResult`. Nothing
     * waits on it with a clock: the provider's screens belong to the person for as long as they need, and
     * a credential that arrived after a deadline would be dropped with the person already signed in there.
     */
    start(provider: OAuthLoginProvider): void;
    /**
     * Calls `listener` with each outcome the app reports for a sign-in `start` began — the credential
     * (`success` with `data.result`), a cancel (`success` with `data.result: null`), or a failure
     * (`success: false` with `error`). Returns the unsubscribe.
     */
    onResult(listener: (outcome: AppMessageData<'OnOAuthLogin'>) => void): () => void;
    /**
     * Runs the provider's sign-in and resolves with the credential it hands back, or `null` when the
     * person cancelled. Waits for a person at the provider's screens; rejects when the request fails, or
     * when they have plainly walked away from it.
     */
    credential(provider: OAuthLoginProvider): Promise<OAuthLoginResult | null>;
}

/** A sign-in through the OAuth relay. */
export interface RelayOAuth {
    /**
     * Sends the person to the relay's authorize page at `url`. The desktop app opens the system browser,
     * where the provider's pages and the person's saved sign-ins are; a browser tab navigates itself.
     */
    openAuthorize(url: string): void;
    /**
     * What the relay's return page does with the code it lands with. `complete` — it exchanges it where
     * it landed, since this is where the sign-in is wanted; `handoff` — it hands the code back to the app
     * that started the sign-in, through a deeplink.
     */
    readonly returnedCode: 'complete' | 'handoff';
    /** The deeplinks a hand-off sends into the app. `null` where none arrive: a browser tab. */
    readonly handoffLinks: HandoffLinks | null;
}

/** The deeplinks a hand-off sends into the app. */
export interface HandoffLinks {
    /**
     * Calls `listener` with each deeplink the app receives — every one, not only a hand-off's: the
     * listener tells its own apart. Returns the unsubscribe.
     */
    subscribe(listener: (deeplink: string) => void): () => void;
}
