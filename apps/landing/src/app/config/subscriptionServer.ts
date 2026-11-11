import { isSubscriptionAccountEnabled } from './stage';

/**
 * Where the account surface's server lives. The addresses come from the build's untracked `.env`, as
 * they do for the web app and the admin console, so no dev address is written into this repository;
 * `.env.example` names the variables. This file and `stage.ts` are the only modules that read
 * `import.meta`.
 *
 * Only a host where the account surface is open has a server, and only when the build carries every
 * address the sign-in needs. Without them the account surface stays shut there too
 * (`isSubscriptionAccountOpen`): there is no in-page stand-in to run it on.
 */
export interface SubscriptionServer {
    /** The OAuth relay the browser is sent to for a social sign-in. */
    socialOauth: string;
    /** The build's `VITE_*` values, which the shared session runtime is configured from. */
    env: (name: string) => string | undefined;
}

/** What the sign-in and the session cannot do without. */
const REQUIRED = ['VITE_OAUTH_ENDPOINT', 'VITE_SOCIAL_OAUTH_ENDPOINT', 'VITE_DOU_ENDPOINT', 'VITE_WS_ENDPOINT'];

export const readSubscriptionServer = (
    values: Record<string, string | boolean | undefined>,
    accountEnabled: boolean
): SubscriptionServer | undefined => {
    const env = (name: string): string | undefined => {
        const value = values[name];
        return typeof value === 'string' && value !== '' ? value : undefined;
    };
    if (!accountEnabled || REQUIRED.some(name => !env(name))) return undefined;
    return {
        // Lower-cased as the shared configuration reads it, so the two never name different hosts.
        socialOauth: (env('VITE_SOCIAL_OAUTH_ENDPOINT') as string).toLowerCase(),
        env,
    };
};

export const subscriptionServer = readSubscriptionServer(import.meta.env, isSubscriptionAccountEnabled);

/**
 * Whether the account surface is open: a host where it may be (`isSubscriptionAccountEnabled`) with a
 * build that carries the server's addresses. Where it is not, only the plans page is registered, as on
 * the production host.
 */
export const isSubscriptionAccountOpen = subscriptionServer !== undefined;
