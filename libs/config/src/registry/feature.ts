import type { ConfigRegistryModule } from '../types';

/**
 * Gates that used to be scattered `isDevBuild()` / `VITE_ENV !== 'PROD'` ternaries.
 *
 * `feature.limits.enforced` is a bypass gate, not a limit value — the limit values themselves
 * (place/channel counts) stay out of this registry because ADR-0060 already moved their source of
 * truth to the server's product catalogue; putting them here would give product limits two owners.
 */
export const featureModule: ConfigRegistryModule = {
    'feature.auth.phoneDevSwitches': {
        title: 'Phone auth dev switches',
        description: 'Shows developer shortcuts on the phone verification screen.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
    },
    'feature.auth.lenientVerifyCode': {
        title: 'Lenient verification code check',
        description: 'Accepts any characters as the verification code during development.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
    },
    'feature.auth.socialLogin': {
        title: 'Social login',
        description: 'Shows social login buttons such as Google.',
        type: 'boolean',
        defaultValue: true,
        byStage: { PROD: false },
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
    },
    'feature.subscription.dryRun': {
        title: 'Subscription payment dry run',
        description: 'Exercises the subscription flow without an actual charge.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
    },
    'feature.limits.enforced': {
        title: 'Creation limits enforced',
        description: 'Actually blocks place/channel creation limits. When off, creation is unlimited for development.',
        type: 'boolean',
        defaultValue: true,
        byStage: { LOCAL: false, DEV: false },
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
    },
};
