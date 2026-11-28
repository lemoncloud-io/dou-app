// eslint-disable-next-line @nx/enforce-module-boundaries -- the store links moved to host-web-browser; shared keeps its old names until its callers import the family directly
export { getStoreUrl, STORE_URLS, type StorePlatform } from '@chatic/host-web-browser';

export const ERROR_MESSAGES = {
    network: {
        title: 'Connection Error',
        description: 'Cannot connect to the server. Please check your internet connection.',
        primaryAction: 'Try Again',
        secondaryAction: 'Refresh',
    },
    auth: {
        title: 'Authentication Error',
        description: 'Your session has expired. Please log in again.',
        primaryAction: 'Log In',
        secondaryAction: 'Go Home',
    },
    server: {
        title: 'Server Error',
        description: 'A server problem occurred. Please try again shortly.',
        primaryAction: 'Try Again',
        secondaryAction: 'Go Home',
    },
    client: {
        title: 'Request Error',
        description: 'There is a problem with the request. Please try again.',
        primaryAction: 'Try Again',
        secondaryAction: 'Go Home',
    },
    unknown: {
        title: 'An Error Occurred',
        description: 'An unexpected error occurred.',
        primaryAction: 'Try Again',
        secondaryAction: 'Go Home',
    },
    notFound: {
        title: 'Page Not Found',
        description: 'The page you requested does not exist or has been moved.',
        primaryAction: 'Go Home',
        secondaryAction: 'Previous Page',
    },
} as const;

export type ErrorMessageType = keyof typeof ERROR_MESSAGES;
