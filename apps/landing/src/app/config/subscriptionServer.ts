import { isSubscriptionAccountEnabled } from './stage';

export interface SubscriptionServer {
    socialOauth: string;
    env: (name: string) => string | undefined;
}

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
        socialOauth: (env('VITE_SOCIAL_OAUTH_ENDPOINT') as string).toLowerCase(),
        env,
    };
};

export const subscriptionServer = readSubscriptionServer(import.meta.env, isSubscriptionAccountEnabled);

export const isSubscriptionAccountOpen = subscriptionServer !== undefined;
