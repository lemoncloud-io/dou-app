import { storeUrls } from '../../home/constants';

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isDev =
    import.meta.env.DEV || window.location.hostname.includes('-dev') || window.location.hostname.includes('app-dev');

export const APP_CONFIG = {
    name: 'DoU',
    scheme: isDev ? 'chatic-dev' : 'chatic',
    packageId: isDev ? 'io.chatic.dou.dev' : 'io.chatic.dou',
    appStoreId: '6758658673',
    storeUrls,
} as const;

export const DEEPLINK_CONFIG = {
    launchTimeout: 2500,
    collectionName: 'deferredDeepLinks',
    linkTtlHours: 1,
} as const;

/** Web app domain configuration */
const getWebConfig = () => {
    if (isLocalhost) {
        return {
            domain: 'localhost:5003',
            protocol: 'http',
        };
    }
    return {
        domain: isDev ? 'dou-dev.chatic.io' : 'dou.chatic.io',
        protocol: 'https',
    };
};

export const WEB_CONFIG = getWebConfig();
