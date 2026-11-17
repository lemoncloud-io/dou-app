import { hostProfile, type HostProfile } from '@chatic/bridges';

import { hostOsOf, resolveAppOrPage, SHELL_DOMAINS_INTRODUCED_IN, type AppOrPage, type HostOs } from './appOrPage';

/**
 * Who signs a person in with a social provider, links accounts, and holds the account a second
 * device pairs with. `app` — the app does, with the platform's own sign-in where it has one (`os`
 * says which), and this device can approve a pairing; `page` — the page does, with the providers' web
 * flows, and this device is the one that asks to pair.
 */
export interface SignInPort {
    readonly kind: AppOrPage;
    readonly os: HostOs;
}

export const resolveSignIn = (profile: HostProfile = hostProfile()): SignInPort => {
    const kind = resolveAppOrPage(profile, 'signIn', SHELL_DOMAINS_INTRODUCED_IN);
    return { kind, os: hostOsOf(profile, kind) };
};
