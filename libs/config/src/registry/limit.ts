import type { ConfigRegistryModule } from '../types';

export const limitModule: ConfigRegistryModule = {
    'limit.image.maxBytes': {
        title: 'Max image upload size',
        description: 'The maximum file size for a profile or channel image.',
        type: 'number',
        defaultValue: 10_485_760,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'limit.auth.resendLimit': {
        title: 'Verification code resend count',
        description: 'The maximum number of times a phone verification code can be resent.',
        type: 'number',
        defaultValue: 5,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'limit.feedback.maxPhotos': {
        title: 'Feedback attachment photo count',
        description: 'The maximum number of photos attachable to one feedback submission.',
        type: 'number',
        defaultValue: 5,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'limit.search.maxResultsPerSection': {
        title: 'Search results per section',
        description: 'The maximum number of results shown per section in unified search.',
        type: 'number',
        defaultValue: 20,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
