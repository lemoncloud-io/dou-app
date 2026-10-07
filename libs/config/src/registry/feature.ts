import type { ConfigRegistryModule } from '../types';

/**
 * Feature gates: the ones that used to be scattered `isDevBuild()` / `VITE_ENV !== 'PROD'` ternaries,
 * and the Lab experiments a person turns on themselves.
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
    // The first Lab experiment. A place invite cannot be taken back once issued and the invitee
    // shows up in no member list, so it ships opt-in rather than on everyone's home menu.
    'feature.placeInvite': {
        title: 'Place invite',
        description: 'Lets a place owner invite people into the place itself, with no chat room, from the home menu.',
        type: 'boolean',
        defaultValue: false,
        surface: 'labs',
        writableBy: ['local', 'server'],
        persist: 'local',
        appliesAt: 'live',
    },
};
