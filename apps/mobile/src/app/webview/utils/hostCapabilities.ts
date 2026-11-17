/**
 * What this app tells the web it can do, in `window.CHATIC_APP_CAPABILITIES`. The web chooses how to
 * reach the host from this declaration rather than from guessing at its kind, so a capability the app
 * gains or loses is a change here, not a branch in the web.
 *
 * Version 1 carries `checkout`: the ways this build sells a subscription, preferred first. The phone
 * app sells through its platform's store, and never points a buyer at another way to pay — the stores'
 * review forbids it — so the website is not listed.
 */
export interface HostCapabilities {
    version: 1;
    checkout: Array<'apple' | 'google' | 'web'>;
}

export const hostCapabilities = (os: string): HostCapabilities => ({
    version: 1,
    checkout: [os === 'ios' ? 'apple' : 'google'],
});
